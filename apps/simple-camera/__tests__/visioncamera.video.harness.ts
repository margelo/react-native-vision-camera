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
  Recorder,
  RecordingFinishedReason,
} from 'react-native-vision-camera'
import { CommonResolutions, VisionCamera } from 'react-native-vision-camera'
import { deferred, withTimeout } from './test-utils'

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('VisionCamera - Video', () => {
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

  // Reproduces a hard, uncatchable crash: calling setOutputSettings({ codec })
  // after a `targetBitRate` was configured aborts the process (SIGTRAP), so the
  // harness app dies rather than this assertion failing cleanly.
  //
  // `setOutputSettings` reads the fully-expanded `output.outputSettings(for:)`
  // dict and writes it back. When `targetBitRate` is set, that dict already
  // contains AVVideoCompressionPropertiesKey plus width/height/color keys.
  // `AVCaptureMovieFileOutput.setOutputSettings:forConnection:` rejects the
  // non-codec/compression keys with an Objective-C NSInvalidArgumentException,
  // which Swift cannot catch — no JS try/catch can prevent the abort.
  //
  // Expected (fixed) behavior: setOutputSettings resolves without crashing.
  it('setOutputSettings({ codec }) does not crash when a targetBitRate is configured', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
      // Populating targetBitRate makes the connection's expanded outputSettings
      // include AVVideoCompressionPropertiesKey, which triggers the crash below.
      targetBitRate: 2_000_000,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    try {
      // On current main this aborts the whole process via an uncatchable ObjC
      // exception. With the bug fixed, it resolves.
      await videoOutput.setOutputSettings({ codec: 'h264' })
    } finally {
      await session.stop()
    }
    // Reaching here without the app crashing means the bug is fixed.
  })

  it('records a short clip and finishes with reason "stopped"', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    const recorder = await videoOutput.createRecorder({})
    // File paths must start with "/" and end with ".mov" or ".mp4".
    expect(recorder.filePath).toMatch(/^\/.*\.(mov|mp4)$/)
    const finished = deferred<{
      path: string
      reason: RecordingFinishedReason
    }>()

    try {
      await recorder.startRecording(
        (path, reason) => finished.resolve({ path, reason }),
        finished.reject,
      )
      await sleep(1_000)
      await recorder.stopRecording()
      const result = await withTimeout(finished.promise, 10_000, 'finish')

      expect(result.reason).toBe('stopped')
      // File paths must start with "/" and end with ".mov" or ".mp4".
      expect(result.path).toMatch(/^\/.*\.(mov|mp4)$/)
    } finally {
      await session.stop()
    }
  })

  it('records with audio enabled', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: true,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    const recorder = await videoOutput.createRecorder({})
    const finished = deferred()
    try {
      await recorder.startRecording(() => finished.resolve(), finished.reject)
      await sleep(1500)
      await recorder.stopRecording()
      await withTimeout(finished.promise, 10_000, 'finish')
    } finally {
      await session.stop()
    }
  })

  it('applies a custom targetBitRate', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
      targetBitRate: 2_000_000,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()
    const recorder = await videoOutput.createRecorder({})
    const finished = deferred()
    try {
      await recorder.startRecording(() => finished.resolve(), finished.reject)
      await sleep(1500)
      await recorder.stopRecording()
      await withTimeout(finished.promise, 10_000, 'finish')
    } finally {
      await session.stop()
    }
  })

  it('stops automatically when maxDuration is reached', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    const recorder = await videoOutput.createRecorder({ maxDuration: 1 })
    const finished = deferred<RecordingFinishedReason>()
    try {
      await recorder.startRecording(
        (_path, reason) => finished.resolve(reason),
        finished.reject,
      )
      const reason = await withTimeout(finished.promise, 15_000, 'maxDuration')
      expect(reason).toBe('max-duration-reached')
    } finally {
      await session.stop()
    }
  })

  it('stops automatically when maxFileSize is reached', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
      targetBitRate: 8_000_000,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    // Device Farm camera feeds are often near-static, and Android encoders can
    // undershoot `targetBitRate` heavily for that content. Keep the cap low
    // enough to be reached in CI while still leaving room for a valid first GOP.
    const recorder = await videoOutput.createRecorder({ maxFileSize: 128_000 })
    const finished = deferred<RecordingFinishedReason>()
    try {
      await recorder.startRecording(
        (_path, reason) => finished.resolve(reason),
        finished.reject,
      )
      const reason = await withTimeout(finished.promise, 30_000, 'maxFileSize')
      expect(reason).toBe('max-file-size-reached')
    } finally {
      await session.stop()
    }
  })

  it('pauses and resumes a recording', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    const recorder = await videoOutput.createRecorder({})
    const paused = deferred()
    const resumed = deferred()
    const finished = deferred()
    try {
      await recorder.startRecording(
        () => finished.resolve(),
        (error) => {
          // Any recording error must abort whichever wait is active.
          paused.reject(error)
          resumed.reject(error)
          finished.reject(error)
        },
        () => paused.resolve(),
        () => resumed.resolve(),
      )
      await sleep(300)
      await recorder.pauseRecording()
      await withTimeout(paused.promise, 5_000, 'pause')

      await recorder.resumeRecording()
      await withTimeout(resumed.promise, 5_000, 'resume')
      await sleep(300)

      await recorder.stopRecording()
      await withTimeout(finished.promise, 10_000, 'finish')
    } finally {
      await session.stop()
    }
  })

  it('cancels a recording and does not fire onRecordingFinished', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    const recorder = await videoOutput.createRecorder({})
    const onRecordingFinished =
      fn<(path: string, reason: RecordingFinishedReason) => void>()
    const onRecordingError = fn<(error: Error) => void>()
    try {
      await recorder.startRecording(onRecordingFinished, onRecordingError)
      await sleep(500)
      await recorder.cancelRecording()
      await sleep(500)
      expect(onRecordingFinished).not.toHaveBeenCalled()
      expect(onRecordingError).not.toHaveBeenCalled()
    } finally {
      await session.stop()
    }
  })

  it('reports growing recordedDuration and recordedFileSize while recording', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    const recorder = await videoOutput.createRecorder({})
    const recordingResult = deferred<Error | undefined>()
    const onRecordingFinished = fn(() => recordingResult.resolve(undefined))
    const onRecordingError = fn((error: Error) =>
      recordingResult.resolve(error),
    )
    try {
      await recorder.startRecording(onRecordingFinished, onRecordingError)
      expect(recorder.filePath).toMatch(/^\/.*\.(mov|mp4)$/)
      const recordingEnded = recordingResult.promise.then((error) => {
        if (error != null) throw error
        throw new Error('Recording finished before reporting progress')
      })
      await Promise.race([
        waitFor(
          () => {
            expect(recorder.recordedDuration).toBeGreaterThan(0)
            expect(recorder.recordedFileSize).toBeGreaterThan(0)
          },
          { timeout: 10_000 },
        ),
        recordingEnded,
      ])
      await recorder.stopRecording()
      const recordingError = await withTimeout(
        recordingResult.promise,
        10_000,
        'finish',
      )
      if (recordingError != null) throw recordingError
      expect(onRecordingFinished).toHaveBeenCalledTimes(1)
      expect(onRecordingError).not.toHaveBeenCalled()
    } finally {
      if (recorder.isRecording) await recorder.cancelRecording()
      await session.stop()
    }
  })

  it('records with a persistent recorder across a session stop/start cycle', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
      enablePersistentRecorder: true,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
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

  it('keeps a persistent recording running while switching the input device', async (context) => {
    const frontDevice = factory.getDefaultCamera('front')
    if (frontDevice == null) {
      return context.skip(
        'persistent recorder device switch: no front camera available',
      )
    }
    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
      enablePersistentRecorder: true,
    })

    // 1. Configure with the back camera
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    const recorder = await videoOutput.createRecorder({})
    const finished = deferred()
    try {
      // 2. Start recording on the back camera
      await recorder.startRecording(() => finished.resolve(), finished.reject)
      await sleep(500)

      // 3. Reconfigure the running session with the front camera — the
      //    persistent recorder must keep running across the input switch.
      await session.configure([
        {
          input: frontDevice,
          outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
          constraints: [],
        },
      ])
      await sleep(500)

      // 4. Stop the recording — the file should contain footage from both cameras.
      await recorder.stopRecording()
      await withTimeout(finished.promise, 15_000, 'finish')
    } finally {
      await session.stop()
    }
  })

  it('records with enableHigherResolutionCodecs on Android', async (context) => {
    if (Platform.OS !== 'android') {
      return context.skip('enableHigherResolutionCodecs: Android only')
    }
    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.FHD_16_9,
      enableAudio: false,
      enableHigherResolutionCodecs: true,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()
    const recorder = await videoOutput.createRecorder({})
    const finished = deferred()
    try {
      await recorder.startRecording(() => finished.resolve(), finished.reject)
      await sleep(1500)
      await recorder.stopRecording()
      await withTimeout(finished.promise, 10_000, 'finish')
    } finally {
      await session.stop()
    }
  })

  it('records to a custom file path', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    // Discover the platform-specific app-writable temp directory by
    // creating a default recorder and reading its chosen file path.
    // We can't hard-code `/tmp/...` because iOS app sandboxes and Android
    // app contexts both use platform-specific dynamic paths.
    const probe = await videoOutput.createRecorder({})
    const probePath = probe.filePath
    const tempDir = probePath.substring(0, probePath.lastIndexOf('/'))
    const ext = Platform.OS === 'ios' ? 'mov' : 'mp4'
    const customPath = `${tempDir}/visioncamera-custom-${Date.now()}.${ext}`

    const recorder = await videoOutput.createRecorder({ filePath: customPath })
    expect(recorder.filePath).toBe(customPath)

    const finished = deferred<string>()
    try {
      await recorder.startRecording(
        (filePath) => finished.resolve(filePath),
        finished.reject,
      )
      await sleep(500)
      await recorder.stopRecording()
      const path = await withTimeout(finished.promise, 10_000, 'finish')

      expect(path).toBe(customPath)
    } finally {
      await session.stop()
    }
  })

  it('auto-creates parent directories for a nested custom file path', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    const probe = await videoOutput.createRecorder({})
    const probePath = probe.filePath
    const tempDir = probePath.substring(0, probePath.lastIndexOf('/'))
    const ext = Platform.OS === 'ios' ? 'mov' : 'mp4'
    // Use multiple non-existent nested folders so the test fails if the
    // implementation doesn't recursively create parent dirs.
    const customPath = `${tempDir}/visioncamera-nested-${Date.now()}/sub/dir/recording.${ext}`

    const recorder = await videoOutput.createRecorder({ filePath: customPath })
    expect(recorder.filePath).toBe(customPath)

    const finished = deferred<string>()
    try {
      await recorder.startRecording(
        (filePath) => finished.resolve(filePath),
        finished.reject,
      )
      await sleep(500)
      await recorder.stopRecording()
      // If the recording finishes without error, the nested directories
      // had to be created on the fly - otherwise the encoder couldn't
      // have written any bytes.
      const path = await withTimeout(finished.promise, 10_000, 'finish')
      expect(path).toBe(customPath)
    } finally {
      await session.stop()
    }
  })

  it('fails to record when given an unwritable file path', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    // The filesystem root is read-only inside both iOS and Android app
    // sandboxes, so writing to `/<file>.mp4` must fail somehow.
    const invalidPath = `/visioncamera-cannot-write-${Date.now()}.mp4`
    let createError: Error | undefined
    let startError: Error | undefined
    let recordingError: Error | undefined

    try {
      let recorder: Recorder | undefined
      try {
        recorder = await videoOutput.createRecorder({ filePath: invalidPath })
      } catch (e) {
        createError = e as Error
      }
      if (recorder != null) {
        try {
          await recorder.startRecording(
            () => {},
            (error) => {
              recordingError = error
            },
          )
        } catch (e) {
          startError = e as Error
        }
        // The error may surface synchronously (startRecording rejection)
        // or asynchronously (onRecordingError callback).
        await waitUntil(() => startError != null || recordingError != null, {
          timeout: 5_000,
        })
      }
    } finally {
      await session.stop()
    }

    const recordingFailure = createError ?? startError ?? recordingError
    expect(recordingFailure).toBeInstanceOf(Error)
  })

  // Verifies that `targetResolution` actually drives the video pipeline.
  // We can't introspect the captured MP4's dimensions from JS today, so the
  // best signal is `videoOutput.currentResolution` once the output has been
  // bound to the configured session.
  it("records at the device's maximum supported video resolution", async () => {
    const supported = backDevice.getSupportedResolutions('video')
    expect(supported).not.toHaveLength(0)
    const max = supported.reduce((a, b) =>
      a.width * a.height > b.width * b.height ? a : b,
    )

    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: max,
      enableAudio: false,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [{ resolutionBias: videoOutput }],
      },
    ])
    await session.start()
    try {
      // iOS only populates the connection's format description once the
      // session is actually streaming, so wait briefly.
      const reported = await waitUntil(() => videoOutput.currentResolution, {
        timeout: 10_000,
      })

      const requestedShortEdge = Math.min(max.width, max.height)
      const requestedLongEdge = Math.max(max.width, max.height)
      const reportedShortEdge = Math.min(reported.width, reported.height)
      const reportedLongEdge = Math.max(reported.width, reported.height)
      expect(reportedShortEdge).toBe(requestedShortEdge)
      expect(reportedLongEdge).toBe(requestedLongEdge)
    } finally {
      await session.stop()
    }
  })

  it("records at the device's minimum supported video resolution", async () => {
    const supported = backDevice.getSupportedResolutions('video')
    expect(supported).not.toHaveLength(0)
    const min = supported.reduce((a, b) =>
      a.width * a.height < b.width * b.height ? a : b,
    )

    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: min,
      enableAudio: false,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [{ resolutionBias: videoOutput }],
      },
    ])
    await session.start()
    try {
      const reported = await waitUntil(() => videoOutput.currentResolution, {
        timeout: 10_000,
      })

      const requestedShortEdge = Math.min(min.width, min.height)
      const requestedLongEdge = Math.max(min.width, min.height)
      const reportedShortEdge = Math.min(reported.width, reported.height)
      const reportedLongEdge = Math.max(reported.width, reported.height)
      expect(reportedShortEdge).toBe(requestedShortEdge)
      expect(reportedLongEdge).toBe(requestedLongEdge)
    } finally {
      await session.stop()
    }
  })

  it('returns supported video codecs on iOS after the output is attached', async (context) => {
    if (Platform.OS !== 'ios') {
      return context.skip('getSupportedVideoCodecs: iOS only')
    }
    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    const codecs = videoOutput.getSupportedVideoCodecs()
    expect(codecs).not.toHaveLength(0)
    expect(codecs).not.toContain('unknown')
    await session.stop()
  })

  it('applies video output settings on iOS after the output is attached', async (context) => {
    if (Platform.OS !== 'ios') {
      return context.skip('setOutputSettings: iOS only')
    }
    const session = await VisionCamera.createCameraSession(false)
    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: videoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])

    try {
      await videoOutput.setOutputSettings({})

      const codecs = videoOutput.getSupportedVideoCodecs()
      expect(codecs).not.toHaveLength(0)
      for (const codec of codecs) {
        await videoOutput.setOutputSettings({ codec })
      }
    } finally {
      await session.stop()
    }
  })
})
