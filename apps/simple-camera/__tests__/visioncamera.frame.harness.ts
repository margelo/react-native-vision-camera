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
  CameraOrientation,
  FrameDroppedReason,
  PixelFormat,
  Point,
  TargetVideoPixelFormat,
} from 'react-native-vision-camera'
import { CommonResolutions, VisionCamera } from 'react-native-vision-camera'
import { provider as workletsProvider } from 'react-native-vision-camera-worklets'
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets'
import { deferred, withTimeout } from './test-utils'

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

  // Regression test for https://github.com/mrousavy/react-native-vision-camera/issues/4096.
  //
  // `Frame.orientation` is a promise about pixels: rotate the buffer clockwise
  // by that orientation's degrees (`up` 0°, `right` 90°, `down` 180°, `left`
  // 270° - the mapping `CameraOrientation.degrees` uses on both platforms, and
  // the one EXIF/`UIImage.Orientation` use) and the Frame is upright.
  // `enablePhysicalBufferRotation` makes the Camera pipeline perform exactly
  // that rotation itself, which is what makes the promise measurable: capture
  // the same Frames once without and once with physical rotation, express both
  // buffers' axes in Camera coordinates, and the angle between them *is* the
  // rotation the pipeline applied to upright the Frame. It must equal the
  // rotation the un-rotated Frame announced - `left` and `right` are both a
  // quarter turn, so nothing but the direction distinguishes them, and every
  // consumer that counter-rotates by `orientation` (MLKit, the Resizer, Skia)
  // ends up 180° off when the two are swapped.
  it('physically rotates a Frame by exactly the rotation its orientation announced', async () => {
    type FrameReport = {
      orientation: CameraOrientation
      width: number
      height: number
      xAxis: Point
      yAxis: Point
    }
    const clockwiseDegrees: Record<CameraOrientation, number> = {
      up: 0,
      right: 90,
      down: 180,
      left: 270,
    }

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
        outputs: [{ output: frameOutput, mirrorMode: 'off' }],
        constraints: [],
      },
    ])

    // A Frame only announces a rotation while the sensor is mounted sideways
    // relative to the target output orientation. Which output orientation that
    // is depends on the hardware, so ask for one and then for a quarter turn
    // away from it - one of the two must come back rotated.
    const candidateOrientations: CameraOrientation[] = ['up', 'right']
    const observedOrientations: string[] = []
    let outputOrientation: CameraOrientation | undefined
    let rawReport: FrameReport | undefined
    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)

    for (const candidateOrientation of candidateOrientations) {
      frameOutput.outputOrientation = candidateOrientation
      const receivedReport = deferred<FrameReport>()
      const report = (frameReport: FrameReport) => {
        receivedReport.resolve(frameReport)
      }
      const errorSub = session.addOnErrorListener(receivedReport.reject)

      runtime.setOnFrameCallback(frameOutput, (frame) => {
        'worklet'
        const origin = frame.convertFramePointToCameraPoint({ x: 0, y: 0 })
        const xAxisEnd = frame.convertFramePointToCameraPoint({
          x: frame.width,
          y: 0,
        })
        const yAxisEnd = frame.convertFramePointToCameraPoint({
          x: 0,
          y: frame.height,
        })
        scheduleOnRN(report, {
          orientation: frame.orientation,
          width: frame.width,
          height: frame.height,
          xAxis: {
            x: xAxisEnd.x - origin.x,
            y: xAxisEnd.y - origin.y,
          },
          yAxis: {
            x: yAxisEnd.x - origin.x,
            y: yAxisEnd.y - origin.y,
          },
        })
        frame.dispose()
      })

      await session.start()
      let frameReport: FrameReport
      try {
        frameReport = await withTimeout(
          receivedReport.promise,
          15_000,
          `receive frame for output orientation ${candidateOrientation}`,
        )
      } finally {
        runtime.setOnFrameCallback(frameOutput, undefined)
        errorSub.remove()
        await session.stop()
      }

      observedOrientations.push(
        `${candidateOrientation} -> ${frameReport.orientation}`,
      )
      if (frameReport.orientation !== 'up') {
        outputOrientation = candidateOrientation
        rawReport = frameReport
        break
      }
    }

    if (outputOrientation == null || rawReport == null) {
      throw new Error(
        `Frames never announced a rotation (${observedOrientations.join(', ')})`,
      )
    }

    const rotatedSession = await VisionCamera.createCameraSession(false)
    const rotatedFrameOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.HD_16_9,
      pixelFormat: 'yuv',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: true,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })
    rotatedFrameOutput.outputOrientation = outputOrientation
    await rotatedSession.configure([
      {
        input: backDevice,
        outputs: [{ output: rotatedFrameOutput, mirrorMode: 'off' }],
        constraints: [],
      },
    ])

    const receivedRotatedReport = deferred<FrameReport>()
    const reportRotated = (frameReport: FrameReport) => {
      receivedRotatedReport.resolve(frameReport)
    }
    const rotatedErrorSub = rotatedSession.addOnErrorListener(
      receivedRotatedReport.reject,
    )
    const rotatedRuntime = workletsProvider.createRuntimeForThread(
      rotatedFrameOutput.thread,
    )
    rotatedRuntime.setOnFrameCallback(rotatedFrameOutput, (frame) => {
      'worklet'
      const origin = frame.convertFramePointToCameraPoint({ x: 0, y: 0 })
      const xAxisEnd = frame.convertFramePointToCameraPoint({
        x: frame.width,
        y: 0,
      })
      const yAxisEnd = frame.convertFramePointToCameraPoint({
        x: 0,
        y: frame.height,
      })
      scheduleOnRN(reportRotated, {
        orientation: frame.orientation,
        width: frame.width,
        height: frame.height,
        xAxis: {
          x: xAxisEnd.x - origin.x,
          y: xAxisEnd.y - origin.y,
        },
        yAxis: {
          x: yAxisEnd.x - origin.x,
          y: yAxisEnd.y - origin.y,
        },
      })
      frame.dispose()
    })

    await rotatedSession.start()
    let rotatedReport: FrameReport
    try {
      rotatedReport = await withTimeout(
        receivedRotatedReport.promise,
        15_000,
        `receive physically rotated frame for ${outputOrientation}`,
      )
    } finally {
      rotatedRuntime.setOnFrameCallback(rotatedFrameOutput, undefined)
      rotatedErrorSub.remove()
      await rotatedSession.stop()
    }

    // The pipeline consumed the orientation by rotating the pixels instead of
    // handing it to us as metadata.
    expect(rotatedReport.orientation).toBe('up')

    const announcedRotation = clockwiseDegrees[rawReport.orientation]
    const rawAspectRatio = rawReport.width / rawReport.height
    const rotatedAspectRatio = rotatedReport.width / rotatedReport.height
    if (announcedRotation === 90 || announcedRotation === 270) {
      // A quarter turn transposes the buffer, whichever way it turned.
      expect(rotatedAspectRatio).toBeCloseTo(1 / rawAspectRatio, 1)
    }

    // Both buffers' axes are expressed in the same Camera coordinate system,
    // so the angle from the un-rotated axes to the physically rotated ones is
    // the rotation the pipeline applied. Angles are measured from the
    // un-rotated x axis towards the un-rotated y axis, which is clockwise in
    // image coordinates because y points down.
    const toUnitVector = (vector: Point): Point => {
      const length = Math.hypot(vector.x, vector.y)
      return { x: vector.x / length, y: vector.y / length }
    }
    const rawXAxis = toUnitVector(rawReport.xAxis)
    const rawYAxis = toUnitVector(rawReport.yAxis)
    const measureClockwiseRotation = (
      rotatedAxis: Point,
      axisDegrees: number,
    ): number => {
      const axis = toUnitVector(rotatedAxis)
      const alongRawXAxis = axis.x * rawXAxis.x + axis.y * rawXAxis.y
      const alongRawYAxis = axis.x * rawYAxis.x + axis.y * rawYAxis.y
      const radians = Math.atan2(alongRawYAxis, alongRawXAxis)
      const degrees = axisDegrees - radians * (180 / Math.PI)
      const quarterTurns = Math.round(degrees / 90)
      return (((quarterTurns * 90) % 360) + 360) % 360
    }
    // Both axes are measured because a single axis cannot tell a rotation
    // apart from a rotation that also mirrored the buffer.
    const xAxisRotation = measureClockwiseRotation(rotatedReport.xAxis, 0)
    const yAxisRotation = measureClockwiseRotation(rotatedReport.yAxis, 90)

    console.log(
      `outputOrientation=${outputOrientation} announced=${rawReport.orientation} (${announcedRotation}°) ` +
        `measured=${xAxisRotation}°/${yAxisRotation}° ` +
        `raw=${rawReport.width}x${rawReport.height} rotated=${rotatedReport.width}x${rotatedReport.height}`,
    )

    expect(xAxisRotation).toBe(announcedRotation)
    expect(yAxisRotation).toBe(announcedRotation)
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
