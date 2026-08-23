import { Platform } from 'react-native'
import {
  assert,
  beforeAll,
  describe,
  expect,
  fn,
  it,
  waitFor,
  waitUntil,
} from 'react-native-harness'
import type { Image } from 'react-native-nitro-image'
import { Images } from 'react-native-nitro-image'
import type {
  CameraDevice,
  CameraDeviceFactory,
  CameraOrientation,
  FlashMode,
  MirrorMode,
  QualityPrioritization,
  Size,
} from 'react-native-vision-camera'
import { CommonResolutions, VisionCamera } from 'react-native-vision-camera'
import { withTimeout } from './test-utils'

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

function readJpegExifOrientation(buffer: ArrayBuffer): number | undefined {
  const view = new DataView(buffer)
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) {
    return undefined
  }

  let offset = 2
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      return undefined
    }
    while (offset < view.byteLength && view.getUint8(offset) === 0xff) {
      offset++
    }

    const marker = view.getUint8(offset)
    offset++
    if (marker === 0xda || marker === 0xd9) {
      return undefined
    }
    if (offset + 2 > view.byteLength) {
      return undefined
    }

    const segmentLength = view.getUint16(offset, false)
    const segmentStart = offset + 2
    const segmentEnd = offset + segmentLength
    if (segmentEnd > view.byteLength || segmentLength < 2) {
      return undefined
    }

    const isExifSegment =
      marker === 0xe1 &&
      segmentStart + 6 <= segmentEnd &&
      view.getUint8(segmentStart) === 0x45 &&
      view.getUint8(segmentStart + 1) === 0x78 &&
      view.getUint8(segmentStart + 2) === 0x69 &&
      view.getUint8(segmentStart + 3) === 0x66 &&
      view.getUint8(segmentStart + 4) === 0x00 &&
      view.getUint8(segmentStart + 5) === 0x00
    if (isExifSegment) {
      return readTiffOrientation(view, segmentStart + 6, segmentEnd)
    }

    offset = segmentEnd
  }

  return undefined
}

function readTiffOrientation(
  view: DataView,
  tiffStart: number,
  tiffEnd: number,
): number | undefined {
  if (tiffStart + 8 > tiffEnd) {
    return undefined
  }

  const byteOrder = view.getUint16(tiffStart, false)
  const littleEndian = byteOrder === 0x4949
  if (!littleEndian && byteOrder !== 0x4d4d) {
    return undefined
  }
  if (view.getUint16(tiffStart + 2, littleEndian) !== 42) {
    return undefined
  }

  const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian)
  const ifdStart = tiffStart + firstIfdOffset
  if (ifdStart + 2 > tiffEnd) {
    return undefined
  }

  const entryCount = view.getUint16(ifdStart, littleEndian)
  for (let index = 0; index < entryCount; index++) {
    const entryStart = ifdStart + 2 + index * 12
    if (entryStart + 12 > tiffEnd) {
      return undefined
    }

    const tag = view.getUint16(entryStart, littleEndian)
    if (tag === 0x0112) {
      return view.getUint16(entryStart + 8, littleEndian)
    }
  }

  return undefined
}

describe('VisionCamera - Photo', () => {
  let factory: CameraDeviceFactory
  let backDevice: CameraDevice

  beforeAll(async () => {
    await VisionCamera.requestCameraPermission()
    expect(VisionCamera.cameraPermissionStatus).toBe('authorized')
    factory = await VisionCamera.createDeviceFactory()
    const back = factory.getDefaultCamera('back')
    assert.exists(back, 'no back camera')
    backDevice = back
  })

  it('captures a JPEG Photo in-memory', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.FHD_4_3,
      containerFormat: 'jpeg',
      quality: 0.9,
      qualityPrioritization: 'balanced',
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    const photo = await photoOutput.capturePhoto(
      { flashMode: 'off', enableShutterSound: false },
      {},
    )
    expect(photo.width).toBeGreaterThan(0)
    expect(photo.height).toBeGreaterThan(0)
    expect(photo.containerFormat).toBe('jpeg')
    expect(photo.isRawPhoto).toBe(false)

    const image = await photo.toImageAsync()
    expect(image.width).toBeGreaterThan(0)
    expect(image.height).toBeGreaterThan(0)
    image.dispose()
    photo.dispose()

    await session.stop()
  })

  it('checks and reads a native Photo pixel buffer in-memory', async (context) => {
    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'native',
      quality: 1,
      qualityPrioritization: 'balanced',
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()
    try {
      const photo = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {},
      )
      try {
        expect(photo.width).toBeGreaterThan(0)
        expect(photo.height).toBeGreaterThan(0)
        expect(photo.containerFormat).not.toBe('unknown')
        if (!photo.hasPixelBuffer) {
          return context.skip(
            'Photo pixel buffer: captured native photo has no pixel buffer',
          )
        }

        const pixelBuffer = photo.getPixelBuffer()
        expect(pixelBuffer.byteLength).toBeGreaterThan(0)
      } finally {
        photo.dispose()
      }
    } finally {
      await session.stop()
    }
  })

  it('saves a JPEG Photo to a temporary file after converting it to an Image', async () => {
    // Regression: on Android, `toImageAsync()` goes through CameraX's
    // `jpegImageToJpegByteArray`, which advances the JPEG plane's `ByteBuffer`
    // position to `capacity`. The plane buffer is shared across reads (Android's
    // `ImageReader` caches the same `ByteBuffer` instance), so a subsequent
    // `saveToTemporaryFileAsync()` that reads `buffer.remaining()` would write a
    // 0-byte file, and `ExifInterface.saveAttributes()` would then throw
    // "ExifInterface only supports saving attributes for JPEG, PNG, and WebP
    // formats" because it cannot sniff the MIME type of an empty file.
    // See `HybridPhoto.kt#saveToFile`.
    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.9,
      qualityPrioritization: 'balanced',
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    const photo = await photoOutput.capturePhoto(
      { flashMode: 'off', enableShutterSound: false },
      {},
    )

    const image = await photo.toImageAsync()
    expect(image.width).toBeGreaterThan(0)
    expect(image.height).toBeGreaterThan(0)
    image.dispose()

    const path = await photo.saveToTemporaryFileAsync()
    // File paths must start with "/" and end with ".jpeg" or ".jpg".
    expect(path).toMatch(/^\/.*\.(jpeg|jpg)$/)
    photo.dispose()

    await session.stop()
  })

  it('preserves JPEG EXIF orientation when saving an in-memory Photo to a file', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.9,
      qualityPrioritization: 'balanced',
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: photoOutput, mirrorMode: 'off' }],
        constraints: [],
      },
    ])
    await session.start()

    try {
      const outputOrientations: CameraOrientation[] = [
        'up',
        'right',
        'down',
        'left',
      ]
      for (const outputOrientation of outputOrientations) {
        photoOutput.outputOrientation = outputOrientation
        const photo = await photoOutput.capturePhoto(
          { flashMode: 'off', enableShutterSound: false },
          {},
        )
        try {
          const inMemoryData = await photo.getFileDataAsync()
          const inMemoryOrientation = readJpegExifOrientation(inMemoryData)
          expect(inMemoryOrientation).toBeDefined()

          const path = await photo.saveToTemporaryFileAsync()
          const response = await fetch(`file://${path}`)
          const savedData = await response.arrayBuffer()
          const savedOrientation = readJpegExifOrientation(savedData)

          expect(savedOrientation).toBe(inMemoryOrientation)
        } finally {
          photo.dispose()
        }
      }
    } finally {
      await session.stop()
    }
  })

  // TODO: Re-enable once VisionCamera exposes a way to query supported photo
  //       container formats upfront (see the TODO in CameraPhotoOutput.nitro.ts
  //       near `TargetPhotoContainerFormat`). Without that API there is no
  //       precondition to gate on, and the HEIC path throws at configure time
  //       on devices that do not support the format.
  it.skip('captures a HEIC Photo', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.FHD_4_3,
      containerFormat: 'heic',
      quality: 0.9,
      qualityPrioritization: 'balanced',
    })
    try {
      await session.configure([
        {
          input: backDevice,
          outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
          constraints: [],
        },
      ])
      await session.start()
      const photo = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {},
      )
      expect(photo.width).toBeGreaterThan(0)
      expect(photo.height).toBeGreaterThan(0)
      photo.dispose()
    } finally {
      await session.stop()
    }
  })

  // TODO: Re-enable once VisionCamera exposes a way to query RAW / DNG support
  //       upfront. Today the CameraX DngCreator path also crashes natively on
  //       some devices with a buffer-size assertion
  //       (java.lang.AssertionError: Height and width of image buffer did not
  //       match height and width of either the preCorrectionActiveArraySize or
  //       the pixelArraySize.) — see androidx.camera.core.imagecapture.DngImage2Disk.
  it.skip('captures a RAW DNG Photo to a file', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.FHD_4_3,
      containerFormat: 'dng',
      quality: 1.0,
      qualityPrioritization: 'quality',
    })
    try {
      await session.configure([
        {
          input: backDevice,
          outputs: [{ output: photoOutput, mirrorMode: 'off' }],
          constraints: [],
        },
      ])
      await session.start()
      const file = await photoOutput.capturePhotoToFile(
        { flashMode: 'off', enableShutterSound: false },
        {},
      )
      expect(file.filePath).not.toHaveLength(0)
    } finally {
      await session.stop()
    }
  })

  it('captures with each qualityPrioritization the device supports', async () => {
    const priorities: QualityPrioritization[] = ['quality', 'balanced']

    for (const qualityPrioritization of priorities) {
      const session = await VisionCamera.createCameraSession(false)
      const photoOutput = VisionCamera.createPhotoOutput({
        targetResolution: CommonResolutions.HD_4_3,
        containerFormat: 'jpeg',
        quality: 0.8,
        qualityPrioritization,
      })
      await session.configure([
        {
          input: backDevice,
          outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
          constraints: [],
        },
      ])
      await session.start()
      const photo = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {},
      )
      expect(photo.width).toBeGreaterThan(0)
      photo.dispose()
      await session.stop()
    }
  })

  it('captures with speed qualityPrioritization when supported', async (context) => {
    if (!backDevice.supportsSpeedQualityPrioritization) {
      return context.skip(
        'qualityPrioritization: speed not supported on device',
      )
    }

    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'speed',
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()
    const photo = await photoOutput.capturePhoto(
      { flashMode: 'off', enableShutterSound: false },
      {},
    )
    expect(photo.width).toBeGreaterThan(0)
    photo.dispose()
    await session.stop()
  })

  it('captures at several target resolutions', async () => {
    const targets: Size[] = [
      CommonResolutions.HD_4_3,
      CommonResolutions.FHD_4_3,
      CommonResolutions.HIGHEST_4_3,
    ]
    for (const targetResolution of targets) {
      const session = await VisionCamera.createCameraSession(false)
      const photoOutput = VisionCamera.createPhotoOutput({
        targetResolution,
        containerFormat: 'jpeg',
        quality: 0.8,
        qualityPrioritization: 'balanced',
      })
      await session.configure([
        {
          input: backDevice,
          outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
          constraints: [],
        },
      ])
      await session.start()
      const photo = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {},
      )
      expect(photo.width).toBeGreaterThan(0)
      expect(photo.height).toBeGreaterThan(0)
      photo.dispose()
      await session.stop()
    }
  })

  // Verifies that `targetResolution` actually drives the output — without these,
  // a regression that snaps every request to a default smaller format would
  // pass all the other photo tests (they only assert width/height > 0).
  it("captures at the device's maximum supported photo resolution", async () => {
    const supportedPhotoResolutions =
      backDevice.getSupportedResolutions('photo')
    expect(supportedPhotoResolutions).not.toHaveLength(0)
    const maxPhotoResolution = supportedPhotoResolutions.reduce((a, b) =>
      a.width * a.height > b.width * b.height ? a : b,
    )

    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: maxPhotoResolution,
      containerFormat: 'native',
      quality: 1,
      qualityPrioritization: 'quality',
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
        constraints: [{ resolutionBias: photoOutput }],
        initialZoom: backDevice.minZoom,
        initialExposureBias: 0,
      },
    ])
    await session.start()
    try {
      const requestedShortEdge = Math.min(
        maxPhotoResolution.width,
        maxPhotoResolution.height,
      )
      const requestedLongEdge = Math.max(
        maxPhotoResolution.width,
        maxPhotoResolution.height,
      )

      // currentResolution must reflect the resolved output size before we
      // even take the picture.
      const reported = photoOutput.currentResolution
      assert.exists(reported, 'no reported photo resolution')
      const reportedShortEdge = Math.min(reported.width, reported.height)
      const reportedLongEdge = Math.max(reported.width, reported.height)
      expect(reportedShortEdge).toBe(requestedShortEdge)
      expect(reportedLongEdge).toBe(requestedLongEdge)

      // TODO: Figure out why we need prepareSettings + 1s sleep to capture max res????
      // Prepare default settings on the Photo Output before capturing,
      // and add an artificial 1 second timeout.
      // This is for some reason required for max res capture on iOS as
      // otherwise the pipeline is not ready for 48MP+ capture (possibly a
      // race condition inside AVFoundation?) and would give us binned (eg 24MP)
      // photos instead - maybe because it tries to give a photo quickly while
      // 48MP is still being warmed up? No idea. Bad DX imo.
      await photoOutput.prepareSettings([{}])
      await sleep(1000)

      const photo = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {},
      )
      const capturedShortEdge = Math.min(photo.width, photo.height)
      const capturedLongEdge = Math.max(photo.width, photo.height)
      expect(capturedShortEdge).toBe(requestedShortEdge)
      expect(capturedLongEdge).toBe(requestedLongEdge)
      photo.dispose()
    } finally {
      await session.stop()
    }
  })

  it("captures at the device's minimum supported photo resolution", async () => {
    const supportedPhotoResolutions =
      backDevice.getSupportedResolutions('photo')
    expect(supportedPhotoResolutions).not.toHaveLength(0)
    const minPhotoResolution = supportedPhotoResolutions.reduce((a, b) =>
      a.width * a.height < b.width * b.height ? a : b,
    )

    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: minPhotoResolution,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
        constraints: [{ resolutionBias: photoOutput }],
      },
    ])
    await session.start()
    try {
      const requestedShortEdge = Math.min(
        minPhotoResolution.width,
        minPhotoResolution.height,
      )
      const requestedLongEdge = Math.max(
        minPhotoResolution.width,
        minPhotoResolution.height,
      )

      const reported = photoOutput.currentResolution
      assert.exists(reported, 'no reported photo resolution')
      const reportedShortEdge = Math.min(reported.width, reported.height)
      const reportedLongEdge = Math.max(reported.width, reported.height)
      expect(reportedShortEdge).toBe(requestedShortEdge)
      expect(reportedLongEdge).toBe(requestedLongEdge)

      const photo = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {},
      )
      const capturedShortEdge = Math.min(photo.width, photo.height)
      const capturedLongEdge = Math.max(photo.width, photo.height)
      expect(capturedShortEdge).toBe(requestedShortEdge)
      expect(capturedLongEdge).toBe(requestedLongEdge)
      photo.dispose()
    } finally {
      await session.stop()
    }
  })

  it('invokes all capture lifecycle callbacks', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    const onWillBeginCapture = fn()
    const onWillCapturePhoto = fn()
    const onDidCapturePhoto = fn()
    const onSessionError = fn<(error: Error) => void>()
    const errorSub = session.addOnErrorListener(onSessionError)

    try {
      const photo = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {
          onWillBeginCapture,
          onWillCapturePhoto,
          onDidCapturePhoto,
        },
      )
      try {
        // Wait for the callbacks to drain BEFORE we stop the session, otherwise
        // pending callback invocations can be dropped.
        await waitUntil(
          () => {
            const error = onSessionError.mock.lastCall?.[0]
            if (error != null) throw error
            return (
              onWillBeginCapture.mock.calls.length >= 1 &&
              onWillCapturePhoto.mock.calls.length >= 1 &&
              onDidCapturePhoto.mock.calls.length >= 1
            )
          },
          { timeout: 5_000 },
        )
      } finally {
        photo.dispose()
      }
    } finally {
      errorSub.remove()
      await session.stop()
    }

    expect(onSessionError).not.toHaveBeenCalled()
    expect(onWillBeginCapture).toHaveBeenCalledTimes(1)
    expect(onWillCapturePhoto).toHaveBeenCalledTimes(1)
    expect(onDidCapturePhoto).toHaveBeenCalledTimes(1)
  })

  it('delivers a preview image when previewImageTargetSize is set and the device supports it', async (context) => {
    if (!backDevice.supportsPreviewImage) {
      return context.skip(
        'onPreviewImageAvailable: device has no preview image support',
      )
    }
    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
      previewImageTargetSize: { width: 256, height: 192 },
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    const onPreviewImageAvailable = fn((image: Image) => image.dispose())
    try {
      const photo = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        { onPreviewImageAvailable },
      )
      try {
        await waitFor(
          () => {
            expect(onPreviewImageAvailable).toHaveBeenCalled()
          },
          { timeout: 5_000 },
        )
      } finally {
        photo.dispose()
      }
    } finally {
      await session.stop()
    }
    expect(onPreviewImageAvailable).toHaveBeenCalledTimes(1)
  })

  it('captures with each flashMode the device supports', async () => {
    const modes: FlashMode[] = ['off', 'auto']

    for (const flashMode of modes) {
      const session = await VisionCamera.createCameraSession(false)
      const photoOutput = VisionCamera.createPhotoOutput({
        targetResolution: CommonResolutions.HD_4_3,
        containerFormat: 'jpeg',
        quality: 0.8,
        qualityPrioritization: 'balanced',
      })
      await session.configure([
        {
          input: backDevice,
          outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
          constraints: [],
        },
      ])
      await session.start()
      const photo = await photoOutput.capturePhoto(
        { flashMode, enableShutterSound: false },
        {},
      )
      expect(photo.width).toBeGreaterThan(0)
      photo.dispose()
      await session.stop()
    }
  })

  it('captures with flashMode on when the device has flash', async (context) => {
    if (!backDevice.hasFlash) {
      return context.skip('flashMode on: device has no flash')
    }

    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()
    const photo = await photoOutput.capturePhoto(
      { flashMode: 'on', enableShutterSound: false },
      {},
    )
    expect(photo.width).toBeGreaterThan(0)
    photo.dispose()
    await session.stop()
  })

  it('prepares flash variants before capturing a photo', async () => {
    const preparedFlashModes: FlashMode[] = ['off', 'auto']
    if (backDevice.hasFlash) {
      preparedFlashModes.push('on')
    }

    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.UHD_4_3,
      containerFormat: 'native',
      quality: 0.95,
      qualityPrioritization: 'quality',
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
        constraints: [{ resolutionBias: photoOutput }],
      },
    ])
    await session.start()

    try {
      await photoOutput.prepareSettings(
        preparedFlashModes.map((flashMode) => ({
          flashMode,
          enableShutterSound: false,
        })),
      )

      const photo = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {},
      )
      expect(photo.width).toBeGreaterThan(0)
      expect(photo.height).toBeGreaterThan(0)
      photo.dispose()
    } finally {
      await session.stop()
    }
  })

  it('rejects a superseded Photo settings preparation', async (context) => {
    if (Platform.OS !== 'ios') {
      return context.skip('Photo settings preparation cancellation: iOS only')
    }

    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    try {
      await session.configure([
        {
          input: backDevice,
          outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
          constraints: [],
        },
      ])

      // iOS defers preparation while the session is stopped. Submitting a new
      // request must cancel the pending request without crashing the process.
      const firstPreparation = photoOutput.prepareSettings([{}])
      const firstPreparationRejection = expect(
        withTimeout(
          firstPreparation,
          10_000,
          'superseded Photo settings preparation',
        ),
      ).rejects.toThrow('Settings preparation has been canceled!')
      const replacementPreparation = photoOutput.prepareSettings([{}])

      await session.start()
      await firstPreparationRejection
      await withTimeout(
        replacementPreparation,
        10_000,
        'replacement Photo settings preparation',
      )
    } finally {
      await session.stop()
    }
  })

  it('toggles enableShutterSound and enableRedEyeReduction without error', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    for (const enableShutterSound of [true, false]) {
      for (const enableRedEyeReduction of [true, false]) {
        const photo = await photoOutput.capturePhoto(
          { flashMode: 'off', enableShutterSound, enableRedEyeReduction },
          {},
        )
        expect(photo.width).toBeGreaterThan(0)
        photo.dispose()
      }
    }

    await session.stop()
  })

  it('applies enableDistortionCorrection when the device supports it', async (context) => {
    if (!backDevice.supportsDistortionCorrection) {
      return context.skip('enableDistortionCorrection: not supported on device')
    }
    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: photoOutput, mirrorMode: 'off' }],
        constraints: [],
      },
    ])
    await session.start()

    const photo = await photoOutput.capturePhoto(
      {
        flashMode: 'off',
        enableShutterSound: false,
        enableDistortionCorrection: true,
      },
      {},
    )
    expect(photo.width).toBeGreaterThan(0)
    photo.dispose()
    await session.stop()
  })

  it('honors the mirrorMode on each output configuration', async () => {
    const modes: MirrorMode[] = ['off', 'on', 'auto']
    for (const mirrorMode of modes) {
      const session = await VisionCamera.createCameraSession(false)
      const photoOutput = VisionCamera.createPhotoOutput({
        targetResolution: CommonResolutions.HD_4_3,
        containerFormat: 'jpeg',
        quality: 0.8,
        qualityPrioritization: 'balanced',
      })
      await session.configure([
        {
          input: backDevice,
          outputs: [{ output: photoOutput, mirrorMode }],
          constraints: [],
        },
      ])
      await session.start()
      const photo = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {},
      )
      switch (mirrorMode) {
        case 'off':
          expect(photo.isMirrored).toBe(false)
          break
        case 'on':
          expect(photo.isMirrored).toBe(true)
          break
        case 'auto': {
          const expectedMirrored = backDevice.position === 'front'
          expect(photo.isMirrored).toBe(expectedMirrored)
          break
        }
      }
      photo.dispose()
      await session.stop()
    }
  })

  it('captures a Photo from the default front camera', async () => {
    const front = factory.getDefaultCamera('front')
    assert.exists(front, 'no front camera')

    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    await session.configure([
      {
        input: front,
        outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()
    const photo = await photoOutput.capturePhoto(
      { flashMode: 'off', enableShutterSound: false },
      {},
    )
    expect(photo.width).toBeGreaterThan(0)
    photo.dispose()
    await session.stop()
  })

  it('writes different file paths for subsequent capturePhotoToFile calls', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    const file1 = await photoOutput.capturePhotoToFile(
      { flashMode: 'off', enableShutterSound: false },
      {},
    )
    const file2 = await photoOutput.capturePhotoToFile(
      { flashMode: 'off', enableShutterSound: false },
      {},
    )
    // File paths must start with "/" and end with ".jpeg" or ".jpg".
    expect(file1.filePath).toMatch(/^\/.*\.(jpeg|jpg)$/)
    expect(file2.filePath).toMatch(/^\/.*\.(jpeg|jpg)$/)
    expect(file1.filePath).not.toBe(file2.filePath)

    await session.stop()
  })

  it('returns captured Photo metadata from capturePhotoToFile', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: photoOutput, mirrorMode: 'on' }],
        constraints: [],
      },
    ])
    await session.start()

    try {
      photoOutput.outputOrientation = 'left'
      const inMemoryPhoto = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {},
      )
      try {
        const photoFile = await photoOutput.capturePhotoToFile(
          { flashMode: 'off', enableShutterSound: false },
          {},
        )

        expect(photoFile.filePath).toMatch(/^\/.*\.(jpeg|jpg)$/)
        expect(photoFile.width).toBe(inMemoryPhoto.width)
        expect(photoFile.height).toBe(inMemoryPhoto.height)
        expect(photoFile.orientation).toBe(inMemoryPhoto.orientation)
        expect(photoFile.isMirrored).toBe(inMemoryPhoto.isMirrored)
        expect(photoFile.timestamp).toBeGreaterThan(0)
        expect(photoFile.isRawPhoto).toBe(inMemoryPhoto.isRawPhoto)
        expect(photoFile.containerFormat).toBe(inMemoryPhoto.containerFormat)
      } finally {
        inMemoryPhoto.dispose()
      }
    } finally {
      await session.stop()
    }
  })

  it('reports supportsDepthDataDelivery on a depth-capable device', async (context) => {
    // `supportsDepthDataDelivery` is a per-output property that flips to `true`
    // once the photo output is bound to a device that can produce depth data.
    // The default back wide-angle on most phones does not — depth-capable
    // devices are typically TrueDepth (front) or LiDAR/Dual virtual cameras.
    // Pick whichever device on the system happens to support depth.
    const depthDevice = factory.cameraDevices.find(
      (d) =>
        d.type === 'true-depth' ||
        d.type === 'lidar-depth' ||
        d.type === 'dual',
    )
    if (depthDevice == null) {
      return context.skip(
        'supportsDepthDataDelivery: no depth-capable device on this system',
      )
    }
    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    await session.configure([
      {
        input: depthDevice,
        outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    try {
      expect(photoOutput.supportsDepthDataDelivery).toBe(true)
    } finally {
      await session.stop()
    }
  })

  it('renders toImage() the same way the reported orientation describes', async (context) => {
    // Regression: `HybridPhoto.toImage()` composed the mirror with `preScale` and
    // the rotation with `postRotate`, which applies the mirror first. A reflection
    // conjugates a rotation into its inverse, so the two orderings differ by twice
    // the rotation - a half turn at a quarter-turn orientation. At `up` and `down`
    // both orderings are the same matrix, so only quarter turns expose it.
    const frontDevice = factory.getDefaultCamera('front')
    assert.exists(frontDevice, 'no front camera')

    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 1,
      qualityPrioritization: 'balanced',
    })
    await session.configure([
      {
        input: frontDevice,
        outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    try {
      // Taken as the pipeline reports it. Forcing `outputOrientation` does not help:
      // CameraX then rotates the pixels itself and reports no rotation at all.
      const photo = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {},
      )
      try {
        const quarterTurns = { left: 90, right: 270 } as const
        const rotation =
          quarterTurns[photo.orientation as keyof typeof quarterTurns]
        if (rotation == null) {
          return context.skip(
            `photo.orientation is "${photo.orientation}": this device does not report a quarter turn, so the mirror and rotation never compose`,
          )
        }
        if (!photo.isMirrored) {
          return context.skip(
            'photo.isMirrored is false: without a mirror both orderings are the same matrix',
          )
        }

        const storedPath = await photo.saveToTemporaryFileAsync()
        const storedImage = await Images.loadFromFileAsync(storedPath)
        const renderedImage = await photo.toImageAsync()
        try {
          const stored = await storedImage.toRawPixelDataAsync(false)
          const rendered = await renderedImage.toRawPixelDataAsync(false)
          if (
            stored.width !== rendered.height ||
            stored.height !== rendered.width
          ) {
            return context.skip(
              `stored ${stored.width}x${stored.height} against rendered ${rendered.width}x${rendered.height}: this platform's decoder already applied the orientation, so the two cannot be compared point by point`,
            )
          }

          const readChannelAverage = (
            pixels: typeof stored,
            x: number,
            y: number,
          ) => {
            const bytes = new Uint8Array(pixels.buffer)
            const bytesPerPixel = Math.floor(
              bytes.length / (pixels.width * pixels.height),
            )
            const offset = (y * pixels.width + x) * bytesPerPixel
            let sum = 0
            for (let channel = 0; channel < 3; channel++) {
              sum += bytes[offset + channel] ?? 0
            }
            return sum / 3
          }

          // Where a rendered point came from in the stored frame, if the rotation
          // the Photo reports is applied first and the mirror after it.
          const toStoredPoint = (x: number, y: number): [number, number] => {
            const mirroredX = rendered.width - 1 - x
            return rotation === 90
              ? [y, stored.height - 1 - mirroredX]
              : [stored.width - 1 - y, mirroredX]
          }

          const steps = 16
          let totalDifference = 0
          let samples = 0
          for (let row = 1; row < steps; row++) {
            for (let column = 1; column < steps; column++) {
              const x = Math.floor((column * rendered.width) / steps)
              const y = Math.floor((row * rendered.height) / steps)
              const [storedX, storedY] = toStoredPoint(x, y)
              totalDifference += Math.abs(
                readChannelAverage(rendered, x, y) -
                  readChannelAverage(stored, storedX, storedY),
              )
              samples++
            }
          }

          // Both images decode the same JPEG, so the rendering the Photo describes
          // is pixel identical to the stored frame read through it - the scene in
          // front of the camera does not matter. Composing the other way round
          // lands a half turn off, on unrelated pixels.
          const meanDifference = totalDifference / samples
          expect(meanDifference).toBeCloseTo(0, 0)
        } finally {
          storedImage.dispose()
          renderedImage.dispose()
        }
      } finally {
        photo.dispose()
      }
    } finally {
      await session.stop()
    }
  })
})
