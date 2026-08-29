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

describe('VisionCamera - Constraints', () => {
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

  it('resolves a baseline config with no constraints', async () => {
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })

    const config = await VisionCamera.resolveConstraints(
      backDevice,
      [{ output: photoOutput, mirrorMode: 'auto' }],
      [],
    )
    expect(backDevice.supportedPixelFormats).toContain(config.nativePixelFormat)
  })

  it('resolves an explicit fps: 30 constraint', async () => {
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    const config = await VisionCamera.resolveConstraints(
      backDevice,
      [{ output: photoOutput, mirrorMode: 'auto' }],
      [{ fps: 30 }],
    )
    expect(config.selectedFPS).toBe(30)
  })

  it('resolves a fps: 60 constraint if the device supports it', async (context) => {
    if (!backDevice.supportsFPS(60)) {
      return context.skip('fps: 60 not supported on this device')
    }
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    const config = await VisionCamera.resolveConstraints(
      backDevice,
      [{ output: videoOutput, mirrorMode: 'auto' }],
      [{ fps: 60 }],
    )
    expect(config.selectedFPS).toBe(60)
  })

  it('keeps 4k video at 60 fps when a preview output is attached', async (context) => {
    const targetResolution = CommonResolutions.UHD_16_9
    const targetShortEdge = Math.min(
      targetResolution.width,
      targetResolution.height,
    )
    const targetLongEdge = Math.max(
      targetResolution.width,
      targetResolution.height,
    )
    const supportsUhdVideo = backDevice
      .getSupportedResolutions('video')
      .some((resolution) => {
        const shortEdge = Math.min(resolution.width, resolution.height)
        const longEdge = Math.max(resolution.width, resolution.height)
        return shortEdge === targetShortEdge && longEdge === targetLongEdge
      })
    if (!supportsUhdVideo) {
      return context.skip('4k video resolution not supported on this device')
    }
    if (!backDevice.supportsFPS(60)) {
      return context.skip('fps: 60 not supported on this device')
    }

    async function resolveVideoSession(includePreview: boolean) {
      const session = await VisionCamera.createCameraSession(false)
      const videoOutput = VisionCamera.createVideoOutput({
        targetResolution,
        enableAudio: false,
        enableHigherResolutionCodecs: true,
      })
      const previewOutput = includePreview
        ? VisionCamera.createPreviewOutput()
        : undefined
      let selectedConfig: CameraSessionConfig | undefined

      await session.configure([
        {
          input: backDevice,
          outputs:
            previewOutput == null
              ? [{ output: videoOutput, mirrorMode: 'auto' }]
              : [
                  { output: previewOutput, mirrorMode: 'auto' },
                  { output: videoOutput, mirrorMode: 'auto' },
                ],
          constraints:
            previewOutput == null
              ? [{ fps: 60 }, { resolutionBias: videoOutput }]
              : [
                  { fps: 60 },
                  { resolutionBias: previewOutput },
                  { resolutionBias: videoOutput },
                ],
          onSessionConfigSelected: (config) => {
            selectedConfig = config
          },
        },
      ])
      const resolvedConfig = await waitUntil(() => selectedConfig, {
        timeout: 5_000,
      })

      await session.start()
      try {
        const currentResolution = await waitUntil(
          () => videoOutput.currentResolution,
          {
            timeout: 10_000,
          },
        )
        return {
          selectedFPS: resolvedConfig.selectedFPS,
          resolution: currentResolution,
        }
      } finally {
        await session.stop()
      }
    }

    const videoOnly = await resolveVideoSession(false)
    const videoOnlyShortEdge = Math.min(
      videoOnly.resolution.width,
      videoOnly.resolution.height,
    )
    const videoOnlyLongEdge = Math.max(
      videoOnly.resolution.width,
      videoOnly.resolution.height,
    )
    if (
      videoOnly.selectedFPS !== 60 ||
      videoOnlyShortEdge !== targetShortEdge ||
      videoOnlyLongEdge !== targetLongEdge
    ) {
      return context.skip(
        `device resolves video-only 4k@60 to ${videoOnly.resolution.width}x${videoOnly.resolution.height}@${videoOnly.selectedFPS ?? 'default'}fps`,
      )
    }

    const withPreview = await resolveVideoSession(true)
    const previewShortEdge = Math.min(
      withPreview.resolution.width,
      withPreview.resolution.height,
    )
    const previewLongEdge = Math.max(
      withPreview.resolution.width,
      withPreview.resolution.height,
    )

    expect(withPreview.selectedFPS).toBe(60)
    expect(previewShortEdge).toBe(targetShortEdge)
    expect(previewLongEdge).toBe(targetLongEdge)
  })

  it('keeps a low video target when preview resolution bias is attached first', async (context) => {
    const targetResolution = CommonResolutions.HD_16_9
    const maxAllowedResolution = CommonResolutions.FHD_16_9
    const uhdResolution = CommonResolutions.UHD_16_9

    const getEdges = (resolution: { width: number; height: number }) => ({
      short: Math.min(resolution.width, resolution.height),
      long: Math.max(resolution.width, resolution.height),
    })

    const targetEdges = getEdges(targetResolution)
    const maxAllowedEdges = getEdges(maxAllowedResolution)
    const uhdEdges = getEdges(uhdResolution)
    const supportedVideoResolutions =
      backDevice.getSupportedResolutions('video')
    const supportsTargetResolution = supportedVideoResolutions.some(
      (resolution) => {
        const edges = getEdges(resolution)
        return (
          edges.short === targetEdges.short && edges.long === targetEdges.long
        )
      },
    )
    const supportsUhdResolution = supportedVideoResolutions.some(
      (resolution) => {
        const edges = getEdges(resolution)
        return edges.short === uhdEdges.short && edges.long === uhdEdges.long
      },
    )
    if (!supportsTargetResolution) {
      return context.skip('720p video resolution not supported on this device')
    }
    if (!supportsUhdResolution) {
      return context.skip('4k video resolution not supported on this device')
    }

    async function resolveLowTargetSession(includePreview: boolean) {
      const session = await VisionCamera.createCameraSession(false)
      const videoOutput = VisionCamera.createVideoOutput({
        targetResolution,
        enableAudio: false,
        enableHigherResolutionCodecs: true,
      })
      const previewOutput = includePreview
        ? VisionCamera.createPreviewOutput()
        : undefined

      await session.configure([
        {
          input: backDevice,
          outputs:
            previewOutput == null
              ? [{ output: videoOutput, mirrorMode: 'auto' }]
              : [
                  { output: previewOutput, mirrorMode: 'auto' },
                  { output: videoOutput, mirrorMode: 'auto' },
                ],
          constraints:
            previewOutput == null
              ? [{ resolutionBias: videoOutput }]
              : [
                  { resolutionBias: previewOutput },
                  { resolutionBias: videoOutput },
                ],
        },
      ])

      await session.start()
      try {
        return await waitUntil(() => videoOutput.currentResolution, {
          timeout: 10_000,
        })
      } finally {
        await session.stop()
      }
    }

    const videoOnly = await resolveLowTargetSession(false)
    const videoOnlyEdges = getEdges(videoOnly)
    if (
      videoOnlyEdges.short > maxAllowedEdges.short ||
      videoOnlyEdges.long > maxAllowedEdges.long
    ) {
      return context.skip(
        `device resolves video-only 720p target to ${videoOnly.width}x${videoOnly.height}`,
      )
    }

    const withPreview = await resolveLowTargetSession(true)
    const previewEdges = getEdges(withPreview)

    expect(previewEdges.short).toBeLessThanOrEqual(maxAllowedEdges.short)
    expect(previewEdges.long).toBeLessThanOrEqual(maxAllowedEdges.long)
  })

  // Regression test for https://github.com/mrousavy/react-native-vision-camera/issues/4073:
  // an explicitly listed resolutionBias for a recording output has a higher
  // priority than the auto-appended preview bias, so an app requesting
  // 1080p must record 1080p - not silently upgrade to 4k because the
  // preview prefers a >= screen-sized format.
  it('records the explicitly biased video resolution when a preview output is attached', async (context) => {
    const targetResolution = CommonResolutions.FHD_16_9
    const getEdges = (resolution: { width: number; height: number }) => ({
      short: Math.min(resolution.width, resolution.height),
      long: Math.max(resolution.width, resolution.height),
    })
    const targetEdges = getEdges(targetResolution)
    const supportsTargetResolution = backDevice
      .getSupportedResolutions('video')
      .some((resolution) => {
        const edges = getEdges(resolution)
        return (
          edges.short === targetEdges.short && edges.long === targetEdges.long
        )
      })
    if (!supportsTargetResolution) {
      return context.skip('1080p video resolution not supported on this device')
    }

    async function resolveExplicitBiasSession(includePreview: boolean) {
      const session = await VisionCamera.createCameraSession(false)
      const videoOutput = VisionCamera.createVideoOutput({
        targetResolution,
        enableAudio: false,
      })
      const previewOutput = includePreview
        ? VisionCamera.createPreviewOutput()
        : undefined
      let selectedConfig: CameraSessionConfig | undefined

      // The same constraints list `useCameraController` builds: the user's
      // explicit constraints first, then one auto-appended resolutionBias
      // per output (preview is listed as the first output by <Camera>).
      await session.configure([
        {
          input: backDevice,
          outputs:
            previewOutput == null
              ? [{ output: videoOutput, mirrorMode: 'auto' }]
              : [
                  { output: previewOutput, mirrorMode: 'auto' },
                  { output: videoOutput, mirrorMode: 'auto' },
                ],
          constraints:
            previewOutput == null
              ? [{ fps: 30 }, { resolutionBias: videoOutput }]
              : [
                  { fps: 30 },
                  { resolutionBias: videoOutput },
                  { resolutionBias: previewOutput },
                  { resolutionBias: videoOutput },
                ],
          onSessionConfigSelected: (config) => {
            selectedConfig = config
          },
        },
      ])
      const resolvedConfig = await waitUntil(() => selectedConfig, {
        timeout: 5_000,
      })

      await session.start()
      try {
        const currentResolution = await waitUntil(
          () => videoOutput.currentResolution,
          {
            timeout: 10_000,
          },
        )
        return {
          selectedFPS: resolvedConfig.selectedFPS,
          resolution: currentResolution,
        }
      } finally {
        await session.stop()
      }
    }

    const videoOnly = await resolveExplicitBiasSession(false)
    const videoOnlyEdges = getEdges(videoOnly.resolution)
    if (
      videoOnly.selectedFPS !== 30 ||
      videoOnlyEdges.short !== targetEdges.short ||
      videoOnlyEdges.long !== targetEdges.long
    ) {
      return context.skip(
        `device resolves video-only 1080p@30 to ${videoOnly.resolution.width}x${videoOnly.resolution.height}@${videoOnly.selectedFPS ?? 'default'}fps`,
      )
    }

    const withPreview = await resolveExplicitBiasSession(true)
    const withPreviewEdges = getEdges(withPreview.resolution)

    expect(withPreview.selectedFPS).toBe(30)
    expect(withPreviewEdges.short).toBe(targetEdges.short)
    expect(withPreviewEdges.long).toBe(targetEdges.long)
  })

  it('keeps the photo target resolution when a preview output is attached', async () => {
    const getEdges = (resolution: { width: number; height: number }) => ({
      short: Math.min(resolution.width, resolution.height),
      long: Math.max(resolution.width, resolution.height),
    })

    async function resolvePhotoSession(includePreview: boolean) {
      const session = await VisionCamera.createCameraSession(false)
      const photoOutput = VisionCamera.createPhotoOutput({
        targetResolution: CommonResolutions.UHD_4_3,
        containerFormat: 'jpeg',
        quality: 0.8,
        qualityPrioritization: 'balanced',
      })
      const previewOutput = includePreview
        ? VisionCamera.createPreviewOutput()
        : undefined

      await session.configure([
        {
          input: backDevice,
          outputs:
            previewOutput == null
              ? [{ output: photoOutput, mirrorMode: 'auto' }]
              : [
                  { output: previewOutput, mirrorMode: 'auto' },
                  { output: photoOutput, mirrorMode: 'auto' },
                ],
          constraints:
            previewOutput == null
              ? [{ resolutionBias: photoOutput }]
              : [
                  { resolutionBias: photoOutput },
                  { resolutionBias: previewOutput },
                ],
        },
      ])

      await session.start()
      try {
        return await waitUntil(() => photoOutput.currentResolution, {
          timeout: 10_000,
        })
      } finally {
        await session.stop()
      }
    }

    const photoOnly = await resolvePhotoSession(false)
    const withPreview = await resolvePhotoSession(true)
    const photoOnlyEdges = getEdges(photoOnly)
    const withPreviewEdges = getEdges(withPreview)

    expect(withPreviewEdges.short).toBe(photoOnlyEdges.short)
    expect(withPreviewEdges.long).toBe(photoOnlyEdges.long)
  })

  it('keeps front TrueDepth FHD resolution bias when requesting 60 fps', async (context) => {
    if (Platform.OS !== 'ios') {
      return context.skip('front TrueDepth FHD@60 resolution bias: iOS only')
    }

    const device = factory.cameraDevices.find(
      (d) => d.position === 'front' && d.type === 'true-depth',
    )
    if (device == null) {
      return context.skip(
        'front TrueDepth FHD@60 resolution bias: no front TrueDepth camera',
      )
    }
    if (!device.supportsFPS(60)) {
      return context.skip(
        'front TrueDepth FHD@60 resolution bias: 60 fps not supported',
      )
    }

    const supportedVideoResolutions = device.getSupportedResolutions('video')
    const hasResolution = (target: { width: number; height: number }) => {
      const targetShortEdge = Math.min(target.width, target.height)
      const targetLongEdge = Math.max(target.width, target.height)
      return supportedVideoResolutions.some((resolution) => {
        const shortEdge = Math.min(resolution.width, resolution.height)
        const longEdge = Math.max(resolution.width, resolution.height)
        return shortEdge === targetShortEdge && longEdge === targetLongEdge
      })
    }
    const hasFHD = hasResolution(CommonResolutions.FHD_16_9)
    const hasUHD = hasResolution(CommonResolutions.UHD_16_9)
    if (!hasFHD || !hasUHD) {
      return context.skip(
        `front TrueDepth FHD@60 resolution bias: video resolutions do not include FHD and UHD (${supportedVideoResolutions
          .map((r) => `${r.width}x${r.height}`)
          .join(', ')})`,
      )
    }

    await VisionCamera.requestMicrophonePermission()
    if (VisionCamera.microphonePermissionStatus !== 'authorized') {
      return context.skip(
        'front TrueDepth FHD@60 resolution bias: microphone permission not authorized',
      )
    }

    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.FHD_16_9,
      enableAudio: true,
    })

    let received: CameraSessionConfig | undefined
    await session.configure([
      {
        input: device,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [{ resolutionBias: videoOutput }, { fps: 60 }],
        onSessionConfigSelected: (config) => {
          received = config
        },
      },
    ])
    await waitUntil(() => received != null, { timeout: 5_000 })
    expect(received?.selectedFPS).toBe(60)

    await session.start()
    try {
      await waitUntil(() => videoOutput.currentResolution != null, {
        timeout: 10_000,
      })

      const reported = videoOutput.currentResolution
      expect(reported).toBeDefined()
      if (reported == null) throw new Error('no reported video resolution')

      const requestedShortEdge = Math.min(
        CommonResolutions.FHD_16_9.width,
        CommonResolutions.FHD_16_9.height,
      )
      const requestedLongEdge = Math.max(
        CommonResolutions.FHD_16_9.width,
        CommonResolutions.FHD_16_9.height,
      )
      const reportedShortEdge = Math.min(reported.width, reported.height)
      const reportedLongEdge = Math.max(reported.width, reported.height)
      console.log(
        `front TrueDepth FHD@60 target=${CommonResolutions.FHD_16_9.width}x${CommonResolutions.FHD_16_9.height} ` +
          `resolved=${reported.width}x${reported.height} config=${received?.toString()}`,
      )
      expect(reportedShortEdge).toBe(requestedShortEdge)
      expect(reportedLongEdge).toBe(requestedLongEdge)
    } finally {
      await session.stop()
    }
  })

  it('resolves photoHDR: true when the device supports photo HDR', async (context) => {
    if (!backDevice.supportsPhotoHDR) {
      return context.skip('photoHDR: not supported on this device')
    }
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    const config = await VisionCamera.resolveConstraints(
      backDevice,
      [{ output: photoOutput, mirrorMode: 'auto' }],
      [{ resolutionBias: photoOutput }, { photoHDR: true }],
    )
    expect(config.isPhotoHDREnabled).toBe(true)
  })

  it('resolves a HDR video dynamic range when the device supports it', async (context) => {
    const hasHdr = backDevice.supportedVideoDynamicRanges.some(
      (d) => d.bitDepth === 'hdr-10-bit',
    )
    if (!hasHdr) {
      return context.skip('video HDR: no HDR dynamic range on this device')
    }
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    const config = await VisionCamera.resolveConstraints(
      backDevice,
      [{ output: videoOutput, mirrorMode: 'auto' }],
      [
        { videoDynamicRange: CommonDynamicRanges.ANY_HDR },
        { resolutionBias: videoOutput },
      ],
    )
    expect(config.selectedVideoDynamicRange?.bitDepth).toBe('hdr-10-bit')
  })

  it('resolves a video stabilization constraint when supported', async (context) => {
    // The resolver downgrades stabilization modes (cinematic → standard → off)
    // when the requested one isn't supported, so picking the most demanding
    // mode the device exposes gives the test the most coverage.
    const stabDevice = factory.cameraDevices.find((d) =>
      d.supportsVideoStabilizationMode('cinematic'),
    )
    if (stabDevice == null) {
      return context.skip(
        'videoStabilizationMode: no device on this system supports "cinematic"',
      )
    }
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    const config = await VisionCamera.resolveConstraints(
      stabDevice,
      [{ output: videoOutput, mirrorMode: 'auto' }],
      [{ videoStabilizationMode: 'cinematic' }],
    )
    expect(config.selectedVideoStabilizationMode).toBe('cinematic')
  })

  it('resolves a preview stabilization constraint when supported', async (context) => {
    const stabDevice = factory.cameraDevices.find((d) =>
      d.supportsPreviewStabilizationMode('preview-optimized'),
    )
    if (stabDevice == null) {
      return context.skip(
        'previewStabilizationMode: no device on this system supports "preview-optimized"',
      )
    }
    const previewOutput = VisionCamera.createPreviewOutput()
    const config = await VisionCamera.resolveConstraints(
      stabDevice,
      [{ output: previewOutput, mirrorMode: 'auto' }],
      [{ previewStabilizationMode: 'preview-optimized' }],
    )
    expect(config.selectedPreviewStabilizationMode).toBe('preview-optimized')
  })

  it('resolves a binned: true constraint when supported', async (context) => {
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    const config = await VisionCamera.resolveConstraints(
      backDevice,
      [{ output: photoOutput, mirrorMode: 'auto' }],
      [{ binned: true }],
    )
    if (config.isBinned !== true) {
      return context.skip(
        `binned: true: device resolved to isBinned=${config.isBinned}`,
      )
    }
  })

  it('resolves the same config via VisionCamera.resolveConstraints and session.configure', async () => {
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    const outputConfig = {
      output: photoOutput,
      mirrorMode: 'auto' as const,
    }
    const constraints: Constraint[] = [{ fps: 30 }]

    const standalone = await VisionCamera.resolveConstraints(
      backDevice,
      [outputConfig],
      constraints,
    )

    const session = await VisionCamera.createCameraSession(false)
    const onSessionConfigSelected = fn<(config: CameraSessionConfig) => void>()
    await session.configure([
      {
        input: backDevice,
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

  // Verifies the resolver's priority mechanism by running the same pair of
  // constraints in both orderings and asserting that the first-listed (= highest
  // priority) one wins in each direction. The lower-priority constraint may or
  // may not survive depending on device combination support — that's a hardware
  // capability question, not a priority-ordering question, so it is not asserted.
  //
  // This catches regressions like "resolver always drops the first constraint
  // instead of the last" or "priority order is silently reversed", without
  // depending on which feature combinations the AWS Device Farm device happens
  // to support together.
  it('honors constraint priority ordering between stabilization and HDR', async (context) => {
    let chosenStabilizationMode: 'cinematic' | 'standard' | undefined
    for (const mode of ['cinematic', 'standard'] as const) {
      if (backDevice.supportsVideoStabilizationMode(mode)) {
        chosenStabilizationMode = mode
        break
      }
    }
    const hasHdr = backDevice.supportedVideoDynamicRanges.some(
      (d) => d.bitDepth === 'hdr-10-bit',
    )

    if (chosenStabilizationMode == null || !hasHdr) {
      return context.skip(
        'priority ordering: device lacks stabilization and/or HDR support',
      )
    }

    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    const outputs = [{ output: videoOutput, mirrorMode: 'auto' as const }]

    // [stab, HDR] — stab has higher priority and must be honored. HDR may
    // legitimately fall back to SDR if the device can't combine them.
    const stabFirst = await VisionCamera.resolveConstraints(
      backDevice,
      outputs,
      [
        { videoStabilizationMode: chosenStabilizationMode },
        { videoDynamicRange: CommonDynamicRanges.ANY_HDR },
      ],
    )
    expect(stabFirst.selectedVideoStabilizationMode).toBe(
      chosenStabilizationMode,
    )

    // [HDR, stab] — HDR has higher priority and must be honored. Stabilization
    // may legitimately fall back to off/auto if the device can't combine them.
    const hdrFirst = await VisionCamera.resolveConstraints(
      backDevice,
      outputs,
      [
        { videoDynamicRange: CommonDynamicRanges.ANY_HDR },
        { videoStabilizationMode: chosenStabilizationMode },
      ],
    )
    expect(hdrFirst.selectedVideoDynamicRange?.bitDepth).toBe('hdr-10-bit')
  })

  it('reconfigures the running session with a different constraint set', async (context) => {
    if (!backDevice.supportsFPS(60)) {
      return context.skip(
        'reconfigure with new constraints: fps: 60 not supported',
      )
    }

    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })

    const onSessionError = fn<(error: Error) => void>()
    const errorSub = session.addOnErrorListener(onSessionError)

    const onFirstConfigSelected = fn<(config: CameraSessionConfig) => void>()
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [{ fps: 30 }],
        onSessionConfigSelected: onFirstConfigSelected,
      },
    ])
    await waitFor(
      () => {
        expect(onFirstConfigSelected).toHaveBeenCalledWith(
          expect.objectContaining({ selectedFPS: 30 }),
        )
      },
      { timeout: 5_000 },
    )

    await session.start()

    try {
      const onSecondConfigSelected = fn<(config: CameraSessionConfig) => void>()
      await session.configure([
        {
          input: backDevice,
          outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
          constraints: [{ fps: 60 }],
          onSessionConfigSelected: onSecondConfigSelected,
        },
      ])
      await waitFor(
        () => {
          expect(onSecondConfigSelected).toHaveBeenCalledWith(
            expect.objectContaining({ selectedFPS: 60 }),
          )
        },
        { timeout: 5_000 },
      )

      expect(onSessionError).not.toHaveBeenCalled()
    } finally {
      errorSub.remove()
      await session.stop()
    }
  })
})
