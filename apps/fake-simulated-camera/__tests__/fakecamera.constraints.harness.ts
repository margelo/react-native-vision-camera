import { Platform } from 'react-native'
import {
  assert,
  beforeAll,
  describe,
  expect,
  fn,
  it,
  waitFor,
} from 'react-native-harness'
import type {
  CameraDevice,
  CameraDeviceFactory,
  CameraSessionConfig,
  Constraint,
} from 'react-native-vision-camera'
import {
  CommonDynamicRanges,
  CommonResolutions,
  VisionCamera,
} from 'react-native-vision-camera'

// fake-back-wide formats (authored in FakeCameraCatalog.m / .kt) in resolver order:
//   1080p60        1920x1080 yuv-420-8-bit-video  1-60 fps   phase-detection    standard+cinematic
//   4k30           3840x2160 yuv-420-8-bit-full   1-30 fps   phase-detection    standard            highest photo quality
//   1080p30-hdr    1920x1080 yuv-420-10-bit-video 1-30 fps   phase-detection    standard+cinematic  HDR
//   720p240-binned 1280x720  yuv-420-8-bit-video  1-240 fps  contrast-detection none                binned
describe('FakeCamera - Constraints', () => {
  let factory: CameraDeviceFactory
  let backWide: CameraDevice
  let ultraWide: CameraDevice
  let front: CameraDevice

  beforeAll(async () => {
    await VisionCamera.requestCameraPermission()
    expect(VisionCamera.cameraPermissionStatus).toBe('authorized')
    factory = await VisionCamera.createDeviceFactory()
    const back = factory.getCameraForId('fake-back-wide')
    const ultra = factory.getCameraForId('fake-back-ultra-wide')
    const frontDevice = factory.getCameraForId('fake-front-wide')
    assert.exists(back, 'fake-back-wide is missing')
    assert.exists(ultra, 'fake-back-ultra-wide is missing')
    assert.exists(frontDevice, 'fake-front-wide is missing')
    backWide = back
    ultraWide = ultra
    front = frontDevice
  })

  const frameOutputOptions = {
    targetResolution: CommonResolutions.HD_16_9,
    pixelFormat: 'yuv',
    enablePreviewSizedOutputBuffers: false,
    enablePhysicalBufferRotation: false,
    enableCameraMatrixDelivery: false,
    allowDeferredStart: false,
    dropFramesWhileBusy: true,
  } as const

  const photoOutputOptions = {
    targetResolution: CommonResolutions.HD_4_3,
    containerFormat: 'jpeg',
    quality: 0.8,
    qualityPrioritization: 'balanced',
  } as const

  it('picks the 60 fps format for fps: 60', async () => {
    const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
    const config = await VisionCamera.resolveConstraints(
      backWide,
      [{ output: frameOutput, mirrorMode: 'auto' }],
      [{ fps: 60 }],
    )
    expect(config.selectedFPS).toBe(60)
  })

  it('picks the 240 fps binned format for fps: 240', async () => {
    const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
    const config = await VisionCamera.resolveConstraints(
      backWide,
      [{ output: frameOutput, mirrorMode: 'auto' }],
      [{ fps: 240 }],
    )
    expect(config.selectedFPS).toBe(240)
  })

  it('clamps fps: 60 to the only range of a 30 fps camera', async () => {
    const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
    const config = await VisionCamera.resolveConstraints(
      ultraWide,
      [{ output: frameOutput, mirrorMode: 'auto' }],
      [{ fps: 60 }],
    )
    expect(config.selectedFPS).toBe(30)
  })

  const videoOutputOptions = {
    targetResolution: CommonResolutions.HD_16_9,
    enableAudio: false,
  } as const

  // The output type feeds the resolver: a photo output appends the highest-photo-quality internal constraints,
  // and each output's streamType decides whether resolutionBias measures photo or video dimensions. So changing
  // only the output changes the resolved format — observable through the public CameraSessionConfig.
  it('resolves different formats when only the attached output type changes', async (context) => {
    if (Platform.OS !== 'ios') {
      return context.skip('format selection: iOS only')
    }
    const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
    const videoOutput = VisionCamera.createVideoOutput(videoOutputOptions)
    const photoOutput = VisionCamera.createPhotoOutput(photoOutputOptions)

    const frameConfig = await VisionCamera.resolveConstraints(
      backWide,
      [{ output: frameOutput, mirrorMode: 'auto' }],
      [],
    )
    const videoConfig = await VisionCamera.resolveConstraints(
      backWide,
      [{ output: videoOutput, mirrorMode: 'auto' }],
      [],
    )
    const photoConfig = await VisionCamera.resolveConstraints(
      backWide,
      [{ output: photoOutput, mirrorMode: 'auto' }],
      [],
    )

    // Frame and video are both video-stream outputs → same baseline format.
    expect(videoConfig.nativePixelFormat).toBe(frameConfig.nativePixelFormat)
    expect(videoConfig.nativePixelFormat).toBe('yuv-420-8-bit-video')
    expect(videoConfig.isPhotoHDREnabled).toBe(false)

    // The photo output pulls the resolver to the highest-quality format instead.
    expect(photoConfig.nativePixelFormat).toBe('yuv-420-8-bit-full')
    expect(photoConfig.isPhotoHDREnabled).toBe(true)
    expect(photoConfig.nativePixelFormat).not.toBe(
      frameConfig.nativePixelFormat,
    )
  })

  it('resolves fps: 60 for a video output', async () => {
    const videoOutput = VisionCamera.createVideoOutput(videoOutputOptions)
    const config = await VisionCamera.resolveConstraints(
      backWide,
      [{ output: videoOutput, mirrorMode: 'auto' }],
      [{ fps: 60 }],
    )
    expect(config.selectedFPS).toBe(60)
  })

  it('resolves the same config via resolveConstraints and session.configure', async () => {
    const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
    const outputConfig = { output: frameOutput, mirrorMode: 'auto' as const }
    const constraints: Constraint[] = [{ fps: 60 }]

    const standalone = await VisionCamera.resolveConstraints(
      backWide,
      [outputConfig],
      constraints,
    )

    const session = await VisionCamera.createCameraSession(false)
    const onSessionConfigSelected = fn<(config: CameraSessionConfig) => void>()
    await session.configure([
      {
        input: backWide,
        outputs: [outputConfig],
        constraints,
        onSessionConfigSelected,
      },
    ])
    await waitFor(
      () => {
        expect(onSessionConfigSelected).toHaveBeenCalledWith(
          expect.objectContaining({
            selectedFPS: standalone.selectedFPS,
            nativePixelFormat: standalone.nativePixelFormat,
            isPhotoHDREnabled: standalone.isPhotoHDREnabled,
            isBinned: standalone.isBinned,
          }),
        )
      },
      { timeout: 5_000 },
    )
    await session.stop()
  })

  describe('AVFoundation format selection', () => {
    it('picks 1080p60 as the baseline for a frame output', async (context) => {
      if (Platform.OS !== 'ios') {
        return context.skip('format selection: iOS only')
      }
      const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
      const config = await VisionCamera.resolveConstraints(
        backWide,
        [{ output: frameOutput, mirrorMode: 'auto' }],
        [],
      )
      expect(config.nativePixelFormat).toBe('yuv-420-8-bit-video')
      expect(config.isBinned).toBe(false)
      expect(config.autoFocusSystem).toBe('phase-detection')
      expect(config.isPhotoHDREnabled).toBe(false)
      expect(config.selectedFPS).toBeUndefined()
    })

    it('prefers the highest-quality photo format for a photo output', async (context) => {
      if (Platform.OS !== 'ios') {
        return context.skip('format selection: iOS only')
      }
      const photoOutput = VisionCamera.createPhotoOutput(photoOutputOptions)
      const config = await VisionCamera.resolveConstraints(
        backWide,
        [{ output: photoOutput, mirrorMode: 'auto' }],
        [],
      )
      expect(config.nativePixelFormat).toBe('yuv-420-8-bit-full')
      expect(config.isPhotoHDREnabled).toBe(true)
    })

    it('resolves fps: 60 to the 1080p60 format', async (context) => {
      if (Platform.OS !== 'ios') {
        return context.skip('format selection: iOS only')
      }
      const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
      const config = await VisionCamera.resolveConstraints(
        backWide,
        [{ output: frameOutput, mirrorMode: 'auto' }],
        [{ fps: 60 }],
      )
      expect(config.selectedFPS).toBe(60)
      expect(config.nativePixelFormat).toBe('yuv-420-8-bit-video')
      expect(config.autoFocusSystem).toBe('phase-detection')
      expect(config.isBinned).toBe(false)
    })

    it('resolves fps: 240 and fps: 120 to the binned 240 fps format', async (context) => {
      if (Platform.OS !== 'ios') {
        return context.skip('format selection: iOS only')
      }
      const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
      for (const fps of [240, 120]) {
        const config = await VisionCamera.resolveConstraints(
          backWide,
          [{ output: frameOutput, mirrorMode: 'auto' }],
          [{ fps }],
        )
        expect(config.selectedFPS).toBe(fps)
        expect(config.isBinned).toBe(true)
        expect(config.autoFocusSystem).toBe('contrast-detection')
      }
    })

    it('resolves fps: 45 inside the 1080p60 range', async (context) => {
      if (Platform.OS !== 'ios') {
        return context.skip('format selection: iOS only')
      }
      const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
      const config = await VisionCamera.resolveConstraints(
        backWide,
        [{ output: frameOutput, mirrorMode: 'auto' }],
        [{ fps: 45 }],
      )
      expect(config.selectedFPS).toBe(45)
      expect(config.isBinned).toBe(false)
      expect(config.nativePixelFormat).toBe('yuv-420-8-bit-video')
    })

    it('picks the 4k format for a 4k resolution bias', async (context) => {
      if (Platform.OS !== 'ios') {
        return context.skip('format selection: iOS only')
      }
      const frameOutput = VisionCamera.createFrameOutput({
        ...frameOutputOptions,
        targetResolution: CommonResolutions.UHD_16_9,
      })
      const config = await VisionCamera.resolveConstraints(
        backWide,
        [{ output: frameOutput, mirrorMode: 'auto' }],
        [{ resolutionBias: frameOutput }],
      )
      expect(config.nativePixelFormat).toBe('yuv-420-8-bit-full')
      expect(config.isPhotoHDREnabled).toBe(true)
      expect(config.selectedFPS).toBeUndefined()

      const session = await VisionCamera.createCameraSession(false)
      await session.configure([
        {
          input: backWide,
          outputs: [{ output: frameOutput, mirrorMode: 'auto' }],
          constraints: [{ resolutionBias: frameOutput }],
        },
      ])
      expect(frameOutput.currentResolution).toEqual({
        width: 3840,
        height: 2160,
      })
    })

    it('keeps fps: 60 over a 4k resolution bias', async (context) => {
      if (Platform.OS !== 'ios') {
        return context.skip('format selection: iOS only')
      }
      const frameOutput = VisionCamera.createFrameOutput({
        ...frameOutputOptions,
        targetResolution: CommonResolutions.UHD_16_9,
      })
      const config = await VisionCamera.resolveConstraints(
        backWide,
        [{ output: frameOutput, mirrorMode: 'auto' }],
        [{ fps: 60 }, { resolutionBias: frameOutput }],
      )
      expect(config.selectedFPS).toBe(60)
      expect(config.nativePixelFormat).toBe('yuv-420-8-bit-video')

      const session = await VisionCamera.createCameraSession(false)
      await session.configure([
        {
          input: backWide,
          outputs: [{ output: frameOutput, mirrorMode: 'auto' }],
          constraints: [{ fps: 60 }, { resolutionBias: frameOutput }],
        },
      ])
      expect(frameOutput.currentResolution).toEqual({
        width: 1920,
        height: 1080,
      })
    })

    it('honors constraint priority between stabilization and pixel format', async (context) => {
      if (Platform.OS !== 'ios') {
        return context.skip('format selection: iOS only')
      }
      const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
      const outputs = [{ output: frameOutput, mirrorMode: 'auto' as const }]

      const stabilizationFirst = await VisionCamera.resolveConstraints(
        backWide,
        outputs,
        [
          { videoStabilizationMode: 'cinematic' },
          { pixelFormat: 'yuv-420-8-bit-full' },
        ],
      )
      expect(stabilizationFirst.selectedVideoStabilizationMode).toBe(
        'cinematic',
      )
      expect(stabilizationFirst.nativePixelFormat).toBe('yuv-420-8-bit-video')

      const pixelFormatFirst = await VisionCamera.resolveConstraints(
        backWide,
        outputs,
        [
          { pixelFormat: 'yuv-420-8-bit-full' },
          { videoStabilizationMode: 'cinematic' },
        ],
      )
      expect(pixelFormatFirst.nativePixelFormat).toBe('yuv-420-8-bit-full')
      expect(pixelFormatFirst.selectedVideoStabilizationMode).toBe('standard')
    })

    it('downgrades an unsupported stabilization mode to the next supported one', async (context) => {
      if (Platform.OS !== 'ios') {
        return context.skip('format selection: iOS only')
      }
      const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
      const config = await VisionCamera.resolveConstraints(
        backWide,
        [{ output: frameOutput, mirrorMode: 'auto' }],
        [{ videoStabilizationMode: 'cinematic-extended' }],
      )
      expect(config.selectedVideoStabilizationMode).toBe('cinematic')
    })

    it('picks the 10-bit HDR format for an HDR dynamic range', async (context) => {
      if (Platform.OS !== 'ios') {
        return context.skip('format selection: iOS only')
      }
      const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
      const config = await VisionCamera.resolveConstraints(
        backWide,
        [{ output: frameOutput, mirrorMode: 'auto' }],
        [{ videoDynamicRange: CommonDynamicRanges.ANY_HDR }],
      )
      expect(config.selectedVideoDynamicRange).toEqual({
        bitDepth: 'hdr-10-bit',
        colorSpace: 'hlg-bt2020',
        colorRange: 'video',
      })
      expect(config.nativePixelFormat).toBe('yuv-420-10-bit-video')
    })

    it('picks the binned format for binned: true', async (context) => {
      if (Platform.OS !== 'ios') {
        return context.skip('format selection: iOS only')
      }
      const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
      const config = await VisionCamera.resolveConstraints(
        backWide,
        [{ output: frameOutput, mirrorMode: 'auto' }],
        [{ binned: true }],
      )
      expect(config.isBinned).toBe(true)
      expect(config.autoFocusSystem).toBe('contrast-detection')
    })

    it('picks the format with the requested pixel format', async (context) => {
      if (Platform.OS !== 'ios') {
        return context.skip('format selection: iOS only')
      }
      const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
      const config = await VisionCamera.resolveConstraints(
        backWide,
        [{ output: frameOutput, mirrorMode: 'auto' }],
        [{ pixelFormat: 'yuv-420-10-bit-video' }],
      )
      expect(config.nativePixelFormat).toBe('yuv-420-10-bit-video')
    })

    it('accepts a resolved config in isSessionConfigSupported', async (context) => {
      if (Platform.OS !== 'ios') {
        return context.skip('format selection: iOS only')
      }
      const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
      const config = await VisionCamera.resolveConstraints(
        backWide,
        [{ output: frameOutput, mirrorMode: 'auto' }],
        [{ fps: 60 }],
      )
      expect(backWide.isSessionConfigSupported(config)).toBe(true)
    })
  })

  describe('CameraX constraint resolution', () => {
    it('picks the range with the closest upper bound for fps: 45', async (context) => {
      if (Platform.OS !== 'android') {
        return context.skip('CameraX fps ranges: Android only')
      }
      const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
      const config = await VisionCamera.resolveConstraints(
        backWide,
        [{ output: frameOutput, mirrorMode: 'auto' }],
        [{ fps: 45 }],
      )
      expect(config.selectedFPS).toBe(60)
    })

    it('keeps a supported stabilization constraint verbatim', async (context) => {
      if (Platform.OS !== 'android') {
        return context.skip('CameraX stabilization: Android only')
      }
      const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
      for (const mode of ['standard', 'cinematic'] as const) {
        const config = await VisionCamera.resolveConstraints(
          backWide,
          [{ output: frameOutput, mirrorMode: 'auto' }],
          [{ videoStabilizationMode: mode }],
        )
        expect(config.selectedVideoStabilizationMode).toBe(mode)
      }
    })

    it('drops a stabilization constraint the camera cannot support', async (context) => {
      if (Platform.OS !== 'android') {
        return context.skip('CameraX stabilization: Android only')
      }
      const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
      const config = await VisionCamera.resolveConstraints(
        ultraWide,
        [{ output: frameOutput, mirrorMode: 'auto' }],
        [{ videoStabilizationMode: 'standard' }],
      )
      expect(config.selectedVideoStabilizationMode).toBeUndefined()
    })

    it('resolves HDR only on the HDR camera', async (context) => {
      if (Platform.OS !== 'android') {
        return context.skip('CameraX dynamic ranges: Android only')
      }
      const frameOutput = VisionCamera.createFrameOutput(frameOutputOptions)
      const backConfig = await VisionCamera.resolveConstraints(
        backWide,
        [{ output: frameOutput, mirrorMode: 'auto' }],
        [{ videoDynamicRange: CommonDynamicRanges.ANY_HDR }],
      )
      expect(backConfig.selectedVideoDynamicRange?.bitDepth).toBe('hdr-10-bit')

      const frontConfig = await VisionCamera.resolveConstraints(
        front,
        [{ output: frameOutput, mirrorMode: 'auto' }],
        [{ videoDynamicRange: CommonDynamicRanges.ANY_HDR }],
      )
      expect(frontConfig.selectedVideoDynamicRange).toBeUndefined()
    })

    // photoHDR (Ultra HDR / JPEG_R) support is read from CameraCharacteristics, which the Android fake does
    // not build (slice-C gate) — so that assertion belongs to the real-Camera2 scene runner, not fake mode.
  })
})
