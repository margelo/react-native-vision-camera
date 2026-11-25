import {
  assert,
  beforeAll,
  describe,
  expect,
  fn,
  it,
  waitUntil,
} from 'react-native-harness'
import type {
  CameraDevice,
  CameraDeviceFactory,
} from 'react-native-vision-camera'
import { CommonResolutions, VisionCamera } from 'react-native-vision-camera'
import { provider as workletsProvider } from 'react-native-vision-camera-worklets'
import { scheduleOnRN } from 'react-native-worklets'
import { deferred, withTimeout } from './test-utils'

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('VisionCamera - Multi-Output', () => {
  let factory: CameraDeviceFactory
  let backDevice: CameraDevice

  beforeAll(async () => {
    await VisionCamera.requestCameraPermission()
    await VisionCamera.requestMicrophonePermission()
    expect(VisionCamera.cameraPermissionStatus).toBe('authorized')
    expect(VisionCamera.microphonePermissionStatus).toBe('authorized')
    factory = await VisionCamera.createDeviceFactory()
    const back = factory.getDefaultCamera('back')
    assert.exists(back, 'no back camera')
    backDevice = back
  })

  it('configures photo + video + frame outputs in a single session', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    const frameOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.HD_16_9,
      pixelFormat: 'native',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })

    const onSessionError = fn<(error: Error) => void>()
    const errorSub = session.addOnErrorListener(onSessionError)

    await session.configure([
      {
        input: backDevice,
        outputs: [
          { output: photoOutput, mirrorMode: 'auto' },
          { output: videoOutput, mirrorMode: 'auto' },
          { output: frameOutput, mirrorMode: 'auto' },
        ],
        constraints: [],
      },
    ])
    await session.start()
    try {
      expect(onSessionError).not.toHaveBeenCalled()
    } finally {
      errorSub.remove()
      await session.stop()
    }
  })

  it('reuses removed preview, photo, and video outputs in a new session', async () => {
    const firstSession = await VisionCamera.createCameraSession(false)
    const secondSession = await VisionCamera.createCameraSession(false)
    const previewOutput = VisionCamera.createPreviewOutput()
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })

    try {
      const firstControllers = await firstSession.configure([
        {
          input: backDevice,
          outputs: [
            { output: previewOutput, mirrorMode: 'auto' },
            { output: photoOutput, mirrorMode: 'auto' },
            { output: videoOutput, mirrorMode: 'auto' },
          ],
          constraints: [],
        },
      ])
      expect(firstControllers).toHaveLength(1)

      await firstSession.configure([])

      const photoControllers = await secondSession.configure([
        {
          input: backDevice,
          outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
          constraints: [],
        },
      ])
      expect(photoControllers).toHaveLength(1)

      const videoControllers = await secondSession.configure([
        {
          input: backDevice,
          outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
          constraints: [],
        },
      ])
      expect(videoControllers).toHaveLength(1)

      const previewControllers = await secondSession.configure([
        {
          input: backDevice,
          outputs: [{ output: previewOutput, mirrorMode: 'auto' }],
          constraints: [],
        },
      ])
      expect(previewControllers).toHaveLength(1)
    } finally {
      await firstSession.stop()
      await secondSession.stop()
    }
  })

  it('streams frames, captures a photo, and records video simultaneously', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    const frameOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.HD_16_9,
      pixelFormat: 'native',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })

    await session.configure([
      {
        input: backDevice,
        outputs: [
          { output: photoOutput, mirrorMode: 'auto' },
          { output: videoOutput, mirrorMode: 'auto' },
          { output: frameOutput, mirrorMode: 'auto' },
        ],
        constraints: [],
      },
    ])

    let framesReceived = 0
    const onFrameReceived = () => {
      framesReceived++
    }
    const onSessionError = fn<(error: Error) => void>()
    const errorSub = session.addOnErrorListener(onSessionError)

    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      scheduleOnRN(onFrameReceived)
      frame.dispose()
    })

    await session.start()
    try {
      // Wait for the frame pipeline to start.
      await waitUntil(
        () => {
          const error = onSessionError.mock.lastCall?.[0]
          if (error != null) throw error
          return framesReceived >= 1
        },
        { timeout: 15_000 },
      )
      expect(onSessionError).not.toHaveBeenCalled()

      // Start recording while frames are still streaming.
      const recorder = await videoOutput.createRecorder({})
      const finished = deferred()
      await recorder.startRecording(() => finished.resolve(), finished.reject)

      // Capture a photo while video is being recorded and frames are still streaming.
      const framesAtPhoto = framesReceived
      const photo = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {},
      )
      expect(photo.width).toBeGreaterThan(0)
      expect(photo.height).toBeGreaterThan(0)
      photo.dispose()

      // Frames must keep arriving after the photo capture completes —
      // photo capture must not permanently stall the frame pipeline.
      await waitUntil(
        () => {
          const error = onSessionError.mock.lastCall?.[0]
          if (error != null) throw error
          return framesReceived > framesAtPhoto + 2
        },
        { timeout: 15_000 },
      )
      expect(onSessionError).not.toHaveBeenCalled()
      expect(framesReceived).toBeGreaterThan(framesAtPhoto)

      await recorder.stopRecording()
      await withTimeout(finished.promise, 15_000, 'finish')
      expect(onSessionError).not.toHaveBeenCalled()
    } finally {
      runtime.setOnFrameCallback(frameOutput, undefined)
      errorSub.remove()
      await session.stop()
    }
  })

  it('keeps a persistent recording running across a session restart with photo + frame outputs attached', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
      enablePersistentRecorder: true,
    })
    const frameOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.HD_16_9,
      pixelFormat: 'native',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })

    await session.configure([
      {
        input: backDevice,
        outputs: [
          { output: photoOutput, mirrorMode: 'auto' },
          { output: videoOutput, mirrorMode: 'auto' },
          { output: frameOutput, mirrorMode: 'auto' },
        ],
        constraints: [],
      },
    ])
    await session.start()

    const recorder = await videoOutput.createRecorder({})
    const finished = deferred()
    try {
      await recorder.startRecording(() => finished.resolve(), finished.reject)
      await sleep(500)

      await session.stop()
      await session.start()
      await sleep(500)

      await recorder.stopRecording()
      await withTimeout(finished.promise, 15_000, 'finish')
    } finally {
      await session.stop()
    }
  })

  it('replaces the photo output while a video + frame output are also attached', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const firstPhotoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    const frameOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.HD_16_9,
      pixelFormat: 'native',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })

    let framesReceived = 0
    const onFrameReceived = () => {
      framesReceived++
    }
    const onSessionError = fn<(error: Error) => void>()
    const errorSub = session.addOnErrorListener(onSessionError)

    await session.configure([
      {
        input: backDevice,
        outputs: [
          { output: firstPhotoOutput, mirrorMode: 'auto' },
          { output: videoOutput, mirrorMode: 'auto' },
          { output: frameOutput, mirrorMode: 'auto' },
        ],
        constraints: [],
      },
    ])

    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      scheduleOnRN(onFrameReceived)
      frame.dispose()
    })

    await session.start()

    try {
      const secondPhotoOutput = VisionCamera.createPhotoOutput({
        targetResolution: CommonResolutions.FHD_4_3,
        containerFormat: 'jpeg',
        quality: 0.5,
        qualityPrioritization: 'quality',
      })

      await session.configure([
        {
          input: backDevice,
          outputs: [
            { output: secondPhotoOutput, mirrorMode: 'auto' },
            { output: videoOutput, mirrorMode: 'auto' },
            { output: frameOutput, mirrorMode: 'auto' },
          ],
          constraints: [],
        },
      ])

      // The replacement photo output captures.
      const photo = await secondPhotoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {},
      )
      expect(photo.width).toBeGreaterThan(0)
      expect(photo.height).toBeGreaterThan(0)
      photo.dispose()

      // The untouched video output still records.
      const recorder = await videoOutput.createRecorder({})
      const finished = deferred()
      await recorder.startRecording(() => finished.resolve(), finished.reject)
      await sleep(500)
      await recorder.stopRecording()
      await withTimeout(finished.promise, 15_000, 'finish')

      // The untouched frame output still streams.
      const framesAtCheck = framesReceived
      await waitUntil(
        () => {
          const error = onSessionError.mock.lastCall?.[0]
          if (error != null) throw error
          return framesReceived > framesAtCheck + 2
        },
        { timeout: 15_000 },
      )
      expect(framesReceived).toBeGreaterThan(framesAtCheck)

      expect(onSessionError).not.toHaveBeenCalled()
    } finally {
      runtime.setOnFrameCallback(frameOutput, undefined)
      errorSub.remove()
      await session.stop()
    }
  })

  it('replaces the video output while a photo + frame output are also attached', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    const firstVideoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    const frameOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.HD_16_9,
      pixelFormat: 'native',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })

    let framesReceived = 0
    const onFrameReceived = () => {
      framesReceived++
    }
    const onSessionError = fn<(error: Error) => void>()
    const errorSub = session.addOnErrorListener(onSessionError)

    await session.configure([
      {
        input: backDevice,
        outputs: [
          { output: photoOutput, mirrorMode: 'auto' },
          { output: firstVideoOutput, mirrorMode: 'auto' },
          { output: frameOutput, mirrorMode: 'auto' },
        ],
        constraints: [],
      },
    ])

    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      scheduleOnRN(onFrameReceived)
      frame.dispose()
    })

    await session.start()

    try {
      const secondVideoOutput = VisionCamera.createVideoOutput({
        targetResolution: CommonResolutions.FHD_16_9,
        enableAudio: false,
      })

      await session.configure([
        {
          input: backDevice,
          outputs: [
            { output: photoOutput, mirrorMode: 'auto' },
            { output: secondVideoOutput, mirrorMode: 'auto' },
            { output: frameOutput, mirrorMode: 'auto' },
          ],
          constraints: [],
        },
      ])

      // The replacement video output records.
      const recorder = await secondVideoOutput.createRecorder({})
      const finished = deferred()
      await recorder.startRecording(() => finished.resolve(), finished.reject)
      await sleep(500)
      await recorder.stopRecording()
      await withTimeout(finished.promise, 15_000, 'finish')

      // The untouched photo output still captures.
      const photo = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {},
      )
      expect(photo.width).toBeGreaterThan(0)
      expect(photo.height).toBeGreaterThan(0)
      photo.dispose()

      // The untouched frame output still streams.
      const framesAtCheck = framesReceived
      await waitUntil(
        () => {
          const error = onSessionError.mock.lastCall?.[0]
          if (error != null) throw error
          return framesReceived > framesAtCheck + 2
        },
        { timeout: 15_000 },
      )
      expect(framesReceived).toBeGreaterThan(framesAtCheck)

      expect(onSessionError).not.toHaveBeenCalled()
    } finally {
      runtime.setOnFrameCallback(frameOutput, undefined)
      errorSub.remove()
      await session.stop()
    }
  })

  it('replaces the frame output with a different pixel format while a photo + video output are also attached', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    const yuvFrameOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.HD_16_9,
      pixelFormat: 'yuv',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })

    const onSessionError = fn<(error: Error) => void>()
    const errorSub = session.addOnErrorListener(onSessionError)

    await session.configure([
      {
        input: backDevice,
        outputs: [
          { output: photoOutput, mirrorMode: 'auto' },
          { output: videoOutput, mirrorMode: 'auto' },
          { output: yuvFrameOutput, mirrorMode: 'auto' },
        ],
        constraints: [],
      },
    ])

    const onYuvFrame = fn<(isPlanar: boolean) => void>()
    const reportYuv = (planar: boolean) => {
      onYuvFrame(planar)
    }
    const yuvRuntime = workletsProvider.createRuntimeForThread(
      yuvFrameOutput.thread,
    )
    yuvRuntime.setOnFrameCallback(yuvFrameOutput, (frame) => {
      'worklet'
      scheduleOnRN(reportYuv, frame.isPlanar)
      frame.dispose()
    })

    await session.start()

    try {
      await waitUntil(
        () => {
          const error = onSessionError.mock.lastCall?.[0]
          if (error != null) throw error
          return onYuvFrame.mock.calls.length > 0
        },
        { timeout: 15_000 },
      )
      expect(onSessionError).not.toHaveBeenCalled()
      expect(onYuvFrame).toHaveBeenLastCalledWith(true)

      yuvRuntime.setOnFrameCallback(yuvFrameOutput, undefined)

      const rgbFrameOutput = VisionCamera.createFrameOutput({
        targetResolution: CommonResolutions.VGA_16_9,
        pixelFormat: 'rgb',
        enablePreviewSizedOutputBuffers: false,
        enablePhysicalBufferRotation: false,
        enableCameraMatrixDelivery: false,
        allowDeferredStart: false,
        dropFramesWhileBusy: true,
      })

      await session.configure([
        {
          input: backDevice,
          outputs: [
            { output: photoOutput, mirrorMode: 'auto' },
            { output: videoOutput, mirrorMode: 'auto' },
            { output: rgbFrameOutput, mirrorMode: 'auto' },
          ],
          constraints: [],
        },
      ])

      const onRgbFrame = fn<(isPlanar: boolean) => void>()
      const reportRgb = (planar: boolean) => {
        onRgbFrame(planar)
      }
      const rgbRuntime = workletsProvider.createRuntimeForThread(
        rgbFrameOutput.thread,
      )
      rgbRuntime.setOnFrameCallback(rgbFrameOutput, (frame) => {
        'worklet'
        scheduleOnRN(reportRgb, frame.isPlanar)
        frame.dispose()
      })

      try {
        await waitUntil(
          () => {
            const error = onSessionError.mock.lastCall?.[0]
            if (error != null) throw error
            return onRgbFrame.mock.calls.length > 0
          },
          { timeout: 15_000 },
        )
        expect(onSessionError).not.toHaveBeenCalled()
        expect(onRgbFrame).toHaveBeenLastCalledWith(false)

        // The untouched photo output still captures.
        const photo = await photoOutput.capturePhoto(
          { flashMode: 'off', enableShutterSound: false },
          {},
        )
        expect(photo.width).toBeGreaterThan(0)
        expect(photo.height).toBeGreaterThan(0)
        photo.dispose()

        // The untouched video output still records.
        const recorder = await videoOutput.createRecorder({})
        const finished = deferred()
        await recorder.startRecording(() => finished.resolve(), finished.reject)
        await sleep(500)
        await recorder.stopRecording()
        await withTimeout(finished.promise, 15_000, 'finish')
      } finally {
        rgbRuntime.setOnFrameCallback(rgbFrameOutput, undefined)
      }
    } finally {
      errorSub.remove()
      await session.stop()
    }
  })

  it('keeps a reused photo output working after its previous session is garbage collected', async () => {
    const { gc } = globalThis as typeof globalThis & { gc?: () => void }
    assert.exists(gc, 'Hermes gc() is not available')
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })

    const firstSession = await VisionCamera.createCameraSession(false)
    await firstSession.configure([
      {
        input: backDevice,
        outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await firstSession.start()
    // Capturing makes sure the output is live in the first session.
    const firstPhoto = await photoOutput.capturePhoto(
      { flashMode: 'off', enableShutterSound: false },
      {},
    )
    firstPhoto.dispose()
    // stop() + configure([]) is the teardown of an unmounting <Camera>.
    // dispose() drops the JS reference before the second session exists; on
    // iOS the native session then lives until the next GC.
    await firstSession.stop()
    await firstSession.configure([])
    firstSession.dispose()

    const secondSession = await VisionCamera.createCameraSession(false)
    const onSessionError = fn<(error: Error) => void>()
    const errorSub = secondSession.addOnErrorListener(onSessionError)
    try {
      await secondSession.configure([
        {
          input: backDevice,
          outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
          constraints: [],
        },
      ])
      await secondSession.start()
      const photoBeforeGC = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {},
      )
      photoBeforeGC.dispose()

      // Free the first session while its old output is live in the second one.
      gc()

      const photoAfterGC = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {},
      )
      expect(photoAfterGC.width).toBeGreaterThan(0)
      expect(photoAfterGC.height).toBeGreaterThan(0)
      photoAfterGC.dispose()
      expect(onSessionError).not.toHaveBeenCalled()
    } finally {
      errorSub.remove()
      await secondSession.stop()
    }
  })
})
