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
  FrameDroppedReason,
  PixelFormat,
  TargetVideoPixelFormat,
} from 'react-native-vision-camera'
import { CommonResolutions, VisionCamera } from 'react-native-vision-camera'
import {
  createWorkletRuntimeForThread,
  getCurrentThreadMarker,
  provider as workletsProvider,
} from 'react-native-vision-camera-worklets'
import {
  createSynchronizable,
  scheduleOnRN,
  scheduleOnRuntime,
} from 'react-native-worklets'
import { deferred, withTimeout } from './test-utils'

// Mirrors `IdentifiableExecutor.IDLE_THREAD_TIMEOUT_MS` on Android.
const FRAME_THREAD_IDLE_TIMEOUT_MS = 5_000

const framePixelFormatCases = [
  {
    targetPixelFormat: 'yuv',
    description: '8-bit 420 YUV',
    expectedPixelFormats: ['yuv-420-8-bit-full', 'yuv-420-8-bit-video'],
  },
  {
    targetPixelFormat: 'rgb',
    description: 'RGB',
    expectedPixelFormats: ['rgb-bgra-8-bit', 'rgb-rgba-8-bit', 'rgb-rgb-8-bit'],
  },
  {
    targetPixelFormat: 'native',
    description: 'private or 8-bit 420 YUV',
    expectedPixelFormats: [
      'private',
      'yuv-420-8-bit-full',
      'yuv-420-8-bit-video',
    ],
  },
] satisfies {
  targetPixelFormat: TargetVideoPixelFormat
  description: string
  expectedPixelFormats: PixelFormat[]
}[]

describe('VisionCamera - Frame', () => {
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

  it('delivers frames to a worklet and posts back via scheduleOnRN', async () => {
    const session = await VisionCamera.createCameraSession(false)
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
        outputs: [{ output: frameOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])

    const receivedFrames = deferred()
    let framesReceived = 0
    const onFrameReceived = () => {
      framesReceived++
      if (framesReceived >= 3) {
        receivedFrames.resolve()
      }
    }
    const errorSub = session.addOnErrorListener(receivedFrames.reject)

    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      scheduleOnRN(onFrameReceived)
      frame.dispose()
    })

    await session.start()
    try {
      await withTimeout(receivedFrames.promise, 15_000, 'receive frames')
    } finally {
      runtime.setOnFrameCallback(frameOutput, undefined)
      errorSub.remove()
      await session.stop()
    }
    expect(framesReceived).toBeGreaterThanOrEqual(3)
  })

  it('stops accepting work on the frame output thread after dispose()', async () => {
    const frameOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.VGA_16_9,
      pixelFormat: 'native',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })
    const thread = frameOutput.thread

    const ranBeforeDispose = deferred()
    thread.runOnThread(() => ranBeforeDispose.resolve())
    await withTimeout(
      ranBeforeDispose.promise,
      5_000,
      'run on frame output thread',
    )

    frameOutput.dispose()

    expect(() => thread.runOnThread(() => {})).toThrow()
  })

  it('drops worklet jobs queued on the frame output thread after dispose()', async () => {
    const frameOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.VGA_16_9,
      pixelFormat: 'native',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })
    const runtime = createWorkletRuntimeForThread(frameOutput.thread)

    const ranBeforeDispose = deferred()
    const onRanBeforeDispose = () => ranBeforeDispose.resolve()
    scheduleOnRuntime(runtime, () => {
      'worklet'
      scheduleOnRN(onRanBeforeDispose)
    })
    await withTimeout(
      ranBeforeDispose.promise,
      5_000,
      'run worklet on frame output thread',
    )

    frameOutput.dispose()

    // Native callers of the worklet queue (timers, Promise continuations)
    // have no error handler, so a rejected job must not throw.
    expect(() =>
      scheduleOnRuntime(runtime, () => {
        'worklet'
      }),
    ).not.toThrow()
  })

  // Red before: `expect(markerAfterIdle).not.toBe(markerBeforeIdle)` - the
  // single-thread executor kept its worker, so both markers were equal.
  it('lets an idle frame output thread exit and runs the next job on a new thread', async (context) => {
    if (Platform.OS !== 'android') {
      return context.skip(
        'idle thread exit: Android only, only Android gives each output its own OS thread',
      )
    }
    const frameOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.VGA_16_9,
      pixelFormat: 'native',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })
    const probe = createWorkletRuntimeForThread(frameOutput.thread)
    const readThreadMarker = async (): Promise<number> => {
      const marker = deferred<number>()
      const onMarker = (value: number) => marker.resolve(value)
      scheduleOnRuntime(probe, () => {
        'worklet'
        scheduleOnRN(onMarker, getCurrentThreadMarker())
      })
      return withTimeout(marker.promise, 5_000, 'read the frame thread marker')
    }

    const markerBeforeIdle = await readThreadMarker()
    // Elapsed idle time is the behavior under test. Nothing may touch the
    // thread during the wait, because each job restarts the idle timer.
    await new Promise<void>((resolve) =>
      setTimeout(resolve, FRAME_THREAD_IDLE_TIMEOUT_MS + 2_000),
    )
    const markerAfterIdle = await readThreadMarker()

    expect(markerAfterIdle).not.toBe(markerBeforeIdle)
  })

  // Guard: green before and after. Red if the idle exit ignores a set frame callback.
  it('keeps the frame output thread while a frame callback is set', async (context) => {
    if (Platform.OS !== 'android') {
      return context.skip(
        'idle thread exit: Android only, only Android gives each output its own OS thread',
      )
    }
    const frameOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.VGA_16_9,
      pixelFormat: 'native',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })
    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      frame.dispose()
    })
    const probe = createWorkletRuntimeForThread(frameOutput.thread)
    const readThreadMarker = async (): Promise<number> => {
      const marker = deferred<number>()
      const onMarker = (value: number) => marker.resolve(value)
      scheduleOnRuntime(probe, () => {
        'worklet'
        scheduleOnRN(onMarker, getCurrentThreadMarker())
      })
      return withTimeout(marker.promise, 5_000, 'read the frame thread marker')
    }

    const markerBeforeIdle = await readThreadMarker()
    // Elapsed idle time is the behavior under test. Nothing may touch the
    // thread during the wait, because each job restarts the idle timer.
    await new Promise<void>((resolve) =>
      setTimeout(resolve, FRAME_THREAD_IDLE_TIMEOUT_MS + 2_000),
    )
    const markerAfterIdle = await readThreadMarker()
    runtime.setOnFrameCallback(frameOutput, undefined)

    expect(markerAfterIdle).toBe(markerBeforeIdle)
  })

  for (const {
    targetPixelFormat,
    description,
    expectedPixelFormats,
  } of framePixelFormatCases) {
    it(`delivers ${description} frames when streaming in ${targetPixelFormat}`, async () => {
      const session = await VisionCamera.createCameraSession(false)
      const frameOutput = VisionCamera.createFrameOutput({
        targetResolution: CommonResolutions.VGA_16_9,
        pixelFormat: targetPixelFormat,
        enablePreviewSizedOutputBuffers: false,
        enablePhysicalBufferRotation: false,
        enableCameraMatrixDelivery: false,
        allowDeferredStart: false,
        dropFramesWhileBusy: true,
      })
      await session.configure([
        {
          input: backDevice,
          outputs: [{ output: frameOutput, mirrorMode: 'auto' }],
          constraints: [],
        },
      ])

      const receivedPixelFormat = deferred<PixelFormat>()
      let didReport = false
      const report = (deliveredPixelFormat: PixelFormat) => {
        if (didReport) return
        didReport = true
        receivedPixelFormat.resolve(deliveredPixelFormat)
      }
      const reportError = (errorMessage: string) => {
        if (didReport) return
        didReport = true
        receivedPixelFormat.reject(new Error(errorMessage))
      }
      const errorSub = session.addOnErrorListener(receivedPixelFormat.reject)

      const runtime = workletsProvider.createRuntimeForThread(
        frameOutput.thread,
      )
      runtime.setOnFrameCallback(frameOutput, (frame) => {
        'worklet'
        try {
          scheduleOnRN(report, frame.pixelFormat)
        } catch (e) {
          scheduleOnRN(reportError, String(e))
        } finally {
          frame.dispose()
        }
      })

      await session.start()
      try {
        const pixelFormat = await withTimeout(
          receivedPixelFormat.promise,
          15_000,
          `receive ${targetPixelFormat} frame pixel format`,
        )
        expect(expectedPixelFormats).toContain(pixelFormat)
      } finally {
        runtime.setOnFrameCallback(frameOutput, undefined)
        errorSub.remove()
        await session.stop()
      }
    })
  }

  it('reports native buffers and conditionally reads pixel buffers', async (context) => {
    const session = await VisionCamera.createCameraSession(false)
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
        outputs: [{ output: frameOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])

    type NativeFrameBufferReport =
      | { state: 'skip'; reason: string }
      | { state: 'error'; errorMessage: string }
      | { state: 'success' }

    type NativeFrameBufferResult =
      | { state: 'skip'; reason: string }
      | { state: 'success'; frames: number }

    const receivedBuffers = deferred<NativeFrameBufferResult>()
    let buffersReceived = 0
    const report = (frameBufferReport: NativeFrameBufferReport) => {
      switch (frameBufferReport.state) {
        case 'skip':
          receivedBuffers.resolve(frameBufferReport)
          break
        case 'error':
          receivedBuffers.reject(new Error(frameBufferReport.errorMessage))
          break
        case 'success':
          buffersReceived++
          if (buffersReceived >= 3) {
            receivedBuffers.resolve({
              state: 'success',
              frames: buffersReceived,
            })
          }
          break
      }
    }
    const errorSub = session.addOnErrorListener(receivedBuffers.reject)

    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      try {
        if (!frame.hasNativeBuffer) {
          scheduleOnRN(report, {
            state: 'skip',
            reason:
              'native frame buffers: device does not expose native buffers',
          })
          return
        }

        const nativeBuffer = frame.getNativeBuffer()
        try {
          if (nativeBuffer.pointer === 0n) {
            scheduleOnRN(report, {
              state: 'error',
              errorMessage: 'Frame native buffer pointer was 0.',
            })
            return
          }
        } finally {
          nativeBuffer.release()
        }

        if (frame.hasPixelBuffer) {
          const pixelBufferBytes = frame.getPixelBuffer().byteLength
          if (pixelBufferBytes <= 0) {
            scheduleOnRN(report, {
              state: 'error',
              errorMessage: 'Frame pixel buffer was empty.',
            })
            return
          }
        }

        scheduleOnRN(report, {
          state: 'success',
        })
      } catch (e) {
        scheduleOnRN(report, {
          state: 'error',
          errorMessage: String(e),
        })
      } finally {
        frame.dispose()
      }
    })

    await session.start()
    try {
      const result = await withTimeout(
        receivedBuffers.promise,
        15_000,
        'receive native frame buffer reports',
      )
      if (result.state === 'skip') {
        return context.skip(result.reason)
      }
      expect(result.frames).toBeGreaterThanOrEqual(3)
    } finally {
      runtime.setOnFrameCallback(frameOutput, undefined)
      errorSub.remove()
      await session.stop()
    }
  })

  it('keeps YUV plane buffers readable across repeated reads', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const frameOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.HD_16_9,
      pixelFormat: 'yuv',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: frameOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])

    type BufferReport = {
      firstPlaneBytes: number[]
      secondPlaneBytes: number[]
    }
    const receivedBufferReports = deferred<BufferReport[]>()
    const bufferReports: BufferReport[] = []
    const report = (firstPlaneBytes: number[], secondPlaneBytes: number[]) => {
      if (bufferReports.length < 3) {
        bufferReports.push({ firstPlaneBytes, secondPlaneBytes })
        if (bufferReports.length >= 3) {
          receivedBufferReports.resolve(bufferReports)
        }
      }
    }
    const reportError = (errorMessage: string) => {
      receivedBufferReports.reject(new Error(errorMessage))
    }
    const errorSub = session.addOnErrorListener(receivedBufferReports.reject)

    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      try {
        const planes = frame.getPlanes()
        const firstPlaneBytes = planes.map(
          (plane) => plane.getPixelBuffer().byteLength,
        )
        const secondPlaneBytes = planes.map(
          (plane) => plane.getPixelBuffer().byteLength,
        )
        scheduleOnRN(report, firstPlaneBytes, secondPlaneBytes)
      } catch (e) {
        scheduleOnRN(reportError, String(e))
      } finally {
        frame.dispose()
      }
    })

    await session.start()
    let reports: BufferReport[] = []
    try {
      reports = await withTimeout(
        receivedBufferReports.promise,
        15_000,
        'read YUV frame pixel buffers',
      )
    } finally {
      runtime.setOnFrameCallback(frameOutput, undefined)
      errorSub.remove()
      await session.stop()
    }

    for (const bufferReport of reports) {
      expect(bufferReport.firstPlaneBytes).not.toHaveLength(0)
      expect(bufferReport.firstPlaneBytes).toEqual(
        bufferReport.secondPlaneBytes,
      )
      for (const planeBytes of bufferReport.firstPlaneBytes) {
        expect(planeBytes).toBeGreaterThan(0)
      }
    }
  })

  it('delivers YUV frames with planar access when streaming in yuv', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const frameOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.HD_16_9,
      pixelFormat: 'yuv',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: frameOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])

    let reportedWidth = 0
    let reportedHeight = 0
    let reportedPlanes = -1
    let reportedPixelFormat: PixelFormat | undefined
    const reportedFrame = deferred()
    const report = (
      w: number,
      h: number,
      planes: number,
      format: PixelFormat,
    ) => {
      reportedWidth = w
      reportedHeight = h
      reportedPlanes = planes
      reportedPixelFormat = format
      if (reportedWidth > 0 && reportedHeight > 0) {
        reportedFrame.resolve()
      }
    }
    const errorSub = session.addOnErrorListener(reportedFrame.reject)

    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      const w = frame.width
      const h = frame.height
      let planeCount = 0
      if (frame.isPlanar) {
        const planes = frame.getPlanes()
        planeCount = planes.length
      }
      scheduleOnRN(report, w, h, planeCount, frame.pixelFormat)
      frame.dispose()
    })

    await session.start()
    try {
      await withTimeout(reportedFrame.promise, 15_000, 'receive YUV frame')
    } finally {
      runtime.setOnFrameCallback(frameOutput, undefined)
      errorSub.remove()
      await session.stop()
    }
    expect(reportedWidth).toBeGreaterThan(0)
    expect(reportedHeight).toBeGreaterThan(0)
    expect(reportedPlanes).toBeGreaterThanOrEqual(1)
    expect(reportedPixelFormat).toBeDefined()
    expect(reportedPixelFormat).not.toBe('unknown')
  })

  it('delivers readable pixel buffers when streaming in rgb', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const frameOutput = VisionCamera.createFrameOutput({
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
        outputs: [{ output: frameOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])

    const receivedFrame = deferred()
    const onFrame = (pixelBufferBytes: number) => {
      if (pixelBufferBytes > 0) {
        receivedFrame.resolve()
      } else {
        receivedFrame.reject(new Error('RGB frame pixel buffer was empty.'))
      }
    }
    const onError = (errorMessage: string) => {
      receivedFrame.reject(new Error(errorMessage))
    }
    const errorSub = session.addOnErrorListener(receivedFrame.reject)

    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      try {
        const pixelBufferBytes = frame.getPixelBuffer().byteLength
        scheduleOnRN(onFrame, pixelBufferBytes)
      } catch (e) {
        scheduleOnRN(onError, String(e))
      } finally {
        frame.dispose()
      }
    })

    await session.start()
    try {
      await withTimeout(receivedFrame.promise, 15_000, 'receive RGB frame')
    } finally {
      runtime.setOnFrameCallback(frameOutput, undefined)
      errorSub.remove()
      await session.stop()
    }
  })

  it('synchronizes state from the worklet using createSynchronizable', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const frameOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.VGA_16_9,
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
        outputs: [{ output: frameOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])

    const counter = createSynchronizable(0)
    const sessionFailed = deferred<never>()
    const errorSub = session.addOnErrorListener(sessionFailed.reject)

    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      counter.setBlocking((prev) => prev + 1)
      frame.dispose()
    })

    await session.start()
    try {
      await Promise.race([
        waitUntil(() => counter.getBlocking() >= 3, { timeout: 15_000 }),
        sessionFailed.promise,
      ])
    } finally {
      runtime.setOnFrameCallback(frameOutput, undefined)
      errorSub.remove()
      await session.stop()
    }
    expect(counter.getBlocking()).toBeGreaterThanOrEqual(3)
  })

  // Verifies that `targetResolution` actually drives the frame pipeline — the
  // other frame tests only assert width/height > 0, so a regression that
  // snaps every request to a default resolution would slip through.
  it("streams frames at the device's maximum supported frame resolution", async () => {
    const supported = backDevice.getSupportedResolutions('stream')
    expect(supported).not.toHaveLength(0)
    const max = supported.reduce((a, b) =>
      a.width * a.height > b.width * b.height ? a : b,
    )

    const session = await VisionCamera.createCameraSession(false)
    const frameOutput = VisionCamera.createFrameOutput({
      targetResolution: max,
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
        outputs: [{ output: frameOutput, mirrorMode: 'auto' }],
        constraints: [{ resolutionBias: frameOutput }],
      },
    ])

    let receivedWidth = 0
    let receivedHeight = 0
    const receivedFrame = deferred()
    const report = (w: number, h: number) => {
      receivedWidth = w
      receivedHeight = h
      if (receivedWidth > 0 && receivedHeight > 0) {
        receivedFrame.resolve()
      }
    }
    const errorSub = session.addOnErrorListener(receivedFrame.reject)

    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      scheduleOnRN(report, frame.width, frame.height)
      frame.dispose()
    })

    await session.start()
    try {
      await withTimeout(
        receivedFrame.promise,
        15_000,
        'receive maximum resolution frame',
      )

      const requestedShortEdge = Math.min(max.width, max.height)
      const requestedLongEdge = Math.max(max.width, max.height)
      const streamedShortEdge = Math.min(receivedWidth, receivedHeight)
      const streamedLongEdge = Math.max(receivedWidth, receivedHeight)

      // currentResolution should match what's actually being streamed.
      const reported = frameOutput.currentResolution
      assert.exists(reported, 'no reported frame resolution')
      const reportedShortEdge = Math.min(reported.width, reported.height)
      const reportedLongEdge = Math.max(reported.width, reported.height)
      expect(reportedShortEdge).toBe(streamedShortEdge)
      expect(reportedLongEdge).toBe(streamedLongEdge)

      expect(streamedShortEdge).toBe(requestedShortEdge)
      expect(streamedLongEdge).toBe(requestedLongEdge)
    } finally {
      runtime.setOnFrameCallback(frameOutput, undefined)
      errorSub.remove()
      await session.stop()
    }
  })

  it("streams frames at the device's minimum supported frame resolution", async () => {
    const supported = backDevice.getSupportedResolutions('stream')
    expect(supported).not.toHaveLength(0)
    const min = supported.reduce((a, b) =>
      a.width * a.height < b.width * b.height ? a : b,
    )

    const session = await VisionCamera.createCameraSession(false)
    const frameOutput = VisionCamera.createFrameOutput({
      targetResolution: min,
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
        outputs: [{ output: frameOutput, mirrorMode: 'auto' }],
        constraints: [{ resolutionBias: frameOutput }],
      },
    ])

    let receivedWidth = 0
    let receivedHeight = 0
    const receivedFrame = deferred()
    const report = (w: number, h: number) => {
      receivedWidth = w
      receivedHeight = h
      if (receivedWidth > 0 && receivedHeight > 0) {
        receivedFrame.resolve()
      }
    }
    const errorSub = session.addOnErrorListener(receivedFrame.reject)

    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      scheduleOnRN(report, frame.width, frame.height)
      frame.dispose()
    })

    await session.start()
    try {
      await withTimeout(
        receivedFrame.promise,
        15_000,
        'receive minimum resolution frame',
      )

      const requestedShortEdge = Math.min(min.width, min.height)
      const requestedLongEdge = Math.max(min.width, min.height)
      const streamedShortEdge = Math.min(receivedWidth, receivedHeight)
      const streamedLongEdge = Math.max(receivedWidth, receivedHeight)

      const reported = frameOutput.currentResolution
      assert.exists(reported, 'no reported frame resolution')
      const reportedShortEdge = Math.min(reported.width, reported.height)
      const reportedLongEdge = Math.max(reported.width, reported.height)
      expect(reportedShortEdge).toBe(streamedShortEdge)
      expect(reportedLongEdge).toBe(streamedLongEdge)

      expect(streamedShortEdge).toBe(requestedShortEdge)
      expect(streamedLongEdge).toBe(requestedLongEdge)
    } finally {
      runtime.setOnFrameCallback(frameOutput, undefined)
      errorSub.remove()
      await session.stop()
    }
  })

  // TODO: Re-enable this test once the Android CameraX ImageAnalysis pipeline surfaces
  //       dropped-frame notifications. Today HybridFrameOutput.setOnFrameDroppedCallback
  //       is a no-op on Android (see the `TODO: CameraX does not have a way to figure
  //       out if a Frame has been dropped` comment in HybridFrameOutput.kt).
  it.skip('invokes the onFrameDropped callback when the worklet stalls', async () => {
    const session = await VisionCamera.createCameraSession(false)
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
        outputs: [{ output: frameOutput, mirrorMode: 'auto' }],
        constraints: [{ fps: 30 }],
      },
    ])

    const onFrameDropped = fn<(reason: FrameDroppedReason) => void>()
    frameOutput.setOnFrameDroppedCallback(onFrameDropped)

    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      const start = Date.now()
      // Deliberately stall so subsequent frames are dropped.
      while (Date.now() - start < 150) {
        // busy wait
      }
      frame.dispose()
    })

    await session.start()
    try {
      await waitFor(
        () => {
          expect(onFrameDropped).toHaveBeenCalled()
        },
        { timeout: 15_000 },
      )
    } finally {
      runtime.setOnFrameCallback(frameOutput, undefined)
      frameOutput.setOnFrameDroppedCallback(undefined)
      await session.stop()
    }
  })

  // TODO: Re-enable once the Android frame output honors `enablePreviewSizedOutputBuffers`
  //       (today HybridFrameOutput.kt / HybridDepthFrameOutput.kt both have a
  //       `TODO: enablePreviewSizedOutputBuffers is not taken into account here.`).
  //       Actually, maybe we should remoev `enablePreviewSizedOutputBuffers` in favor of
  //       the simple, yet more flexible `targetResolution: ...` prop anyways.
  it.skip('delivers smaller buffers when enablePreviewSizedOutputBuffers is true', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const frameOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.UHD_16_9,
      pixelFormat: 'native',
      enablePreviewSizedOutputBuffers: true,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: frameOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])

    let reportedWidth = 0
    let reportedHeight = 0
    const report = (w: number, h: number) => {
      reportedWidth = w
      reportedHeight = h
    }

    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      scheduleOnRN(report, frame.width, frame.height)
      frame.dispose()
    })

    await session.start()
    try {
      await waitUntil(() => reportedWidth > 0 && reportedHeight > 0, {
        timeout: 15_000,
      })
    } finally {
      runtime.setOnFrameCallback(frameOutput, undefined)
      await session.stop()
    }
    const requestedPixels =
      CommonResolutions.UHD_16_9.width * CommonResolutions.UHD_16_9.height
    const actualPixels = reportedWidth * reportedHeight
    expect(actualPixels).toBeLessThan(requestedPixels)
  })
})
