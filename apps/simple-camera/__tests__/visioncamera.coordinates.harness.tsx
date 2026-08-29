import { type LayoutChangeEvent, Platform, StyleSheet } from 'react-native'
import {
  assert,
  beforeAll,
  describe,
  expect,
  fn,
  it,
  render,
  waitUntil,
} from 'react-native-harness'
import { callback } from 'react-native-nitro-modules'
import type {
  CameraDevice,
  CameraDeviceFactory,
  Point,
  PreviewView,
} from 'react-native-vision-camera'
import {
  CommonResolutions,
  NativePreviewView,
  VisionCamera,
} from 'react-native-vision-camera'
import { provider as workletsProvider } from 'react-native-vision-camera-worklets'
import { scheduleOnRN } from 'react-native-worklets'
import { deferred, withTimeout } from './test-utils'

describe('VisionCamera - Coordinates', () => {
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

  // ---------------------------------------------------------------------------
  // Frame coordinate conversions (worklet thread)
  // ---------------------------------------------------------------------------

  // Round-trips through the affine sensor<->buffer matrix. If a regression
  // makes the matrix non-invertible or stops accounting for one of the
  // axes, this catches it without depending on the camera's opaque sensor
  // coordinate system.
  it('round-trips Frame -> Camera -> Frame coordinates for the frame center and corners', async () => {
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

    type Report = {
      width: number
      height: number
      points: { input: Point; roundTripped: Point }[]
    }
    let report: Report | undefined
    const onReport = (r: Report) => {
      report = r
    }
    const onError = fn<(error: Error) => void>()
    const errorSub = session.addOnErrorListener(onError)

    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      const w = frame.width
      const h = frame.height
      const inputs: Point[] = [
        { x: w / 2, y: h / 2 },
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: 0, y: h },
        { x: w, y: h },
      ]
      const result = inputs.map((input) => {
        const cameraPoint = frame.convertFramePointToCameraPoint(input)
        const roundTripped = frame.convertCameraPointToFramePoint(cameraPoint)
        return { input, roundTripped }
      })
      scheduleOnRN(onReport, { width: w, height: h, points: result })
      frame.dispose()
    })

    await session.start()
    try {
      await waitUntil(() => report != null || onError.mock.calls.length > 0, {
        timeout: 15_000,
      })
      expect(onError).not.toHaveBeenCalled()
      const r = report
      if (r == null) throw new Error('no report')
      for (const { input, roundTripped } of r.points) {
        // toBeCloseTo(expected, 0) tolerates |received - expected| < 0.5 —
        // tight enough to catch a regression, loose enough to ride out
        // sub-pixel ULPs from the 3x3 affine matrix round-trip.
        expect(roundTripped.x).toBeCloseTo(input.x, 0)
        expect(roundTripped.y).toBeCloseTo(input.y, 0)
      }
    } finally {
      runtime.setOnFrameCallback(frameOutput, undefined)
      errorSub.remove()
      await session.stop()
    }
  })

  // The frame center maps to *some* point in opaque camera space, and that
  // point must be stable across consecutive frames as long as the device
  // isn't moving. If a regression makes the conversion read out an
  // uninitialized matrix or accidentally use frame timestamps, this
  // catches a value that jitters frame-to-frame.
  it('produces a stable camera point for the frame center across consecutive frames', async () => {
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

    const samples: Point[] = []
    const onSample = (p: Point) => {
      samples.push(p)
    }
    const onError = fn<(error: Error) => void>()
    const errorSub = session.addOnErrorListener(onError)

    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      const center = { x: frame.width / 2, y: frame.height / 2 }
      const cameraPoint = frame.convertFramePointToCameraPoint(center)
      scheduleOnRN(onSample, cameraPoint)
      frame.dispose()
    })

    await session.start()
    try {
      await waitUntil(
        () => samples.length >= 5 || onError.mock.calls.length > 0,
        {
          timeout: 15_000,
        },
      )
      expect(onError).not.toHaveBeenCalled()
      expect(samples.length).toBeGreaterThanOrEqual(5)
      const first = samples[0]
      if (first == null) throw new Error('no samples')
      for (const s of samples) {
        // Camera coordinates are opaque between platforms (iOS normalizes
        // to [0,1], Android stays in sensor-pixel space). All we assert is
        // that for a stationary device, the result doesn't move.
        expect(s.x).toBeCloseTo(first.x, 0)
        expect(s.y).toBeCloseTo(first.y, 0)
      }
    } finally {
      runtime.setOnFrameCallback(frameOutput, undefined)
      errorSub.remove()
      await session.stop()
    }
  })

  // ---------------------------------------------------------------------------
  // Preview coordinate conversions (mounted NativePreviewView)
  // ---------------------------------------------------------------------------

  // Helper inlined per test so each `it` reads end-to-end. This block is the
  // setup pattern reused below: configure -> render the view -> start ->
  // wait for the ref + layout + onPreviewStarted. Tests don't share state.

  it('round-trips View -> Camera -> View coordinates for the view center and corners', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const previewOutput = VisionCamera.createPreviewOutput()
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: previewOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])

    let previewRef: PreviewView | undefined
    const previewStarted = deferred()
    const layout = deferred<{ width: number; height: number }>()
    const onError = fn((error: Error) => {
      previewStarted.reject(error)
      layout.reject(error)
    })
    const errorSub = session.addOnErrorListener(onError)

    await render(
      <NativePreviewView
        style={StyleSheet.absoluteFill}
        previewOutput={previewOutput}
        hybridRef={callback((r: PreviewView) => {
          previewRef = r
        })}
        onPreviewStarted={callback(() => {
          previewStarted.resolve()
        })}
        onLayout={(e: LayoutChangeEvent) => {
          layout.resolve({
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          })
        }}
      />,
    )

    await session.start()
    try {
      await withTimeout(layout.promise, 10_000, 'preview view onLayout')
      await withTimeout(previewStarted.promise, 15_000, 'preview started')
      expect(onError).not.toHaveBeenCalled()
      if (previewRef == null) throw new Error('no preview ref')

      const { width: w, height: h } = await layout.promise
      const inputs: Point[] = [
        { x: w / 2, y: h / 2 },
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: 0, y: h },
        { x: w, y: h },
      ]
      for (const input of inputs) {
        const cameraPoint = previewRef.convertViewPointToCameraPoint(input)
        const roundTripped =
          previewRef.convertCameraPointToViewPoint(cameraPoint)
        expect(roundTripped.x).toBeCloseTo(input.x, 0)
        expect(roundTripped.y).toBeCloseTo(input.y, 0)
      }
    } finally {
      errorSub.remove()
      await session.stop()
    }
  })

  // The view center has to map back to the view center through both halves
  // of the API independently. This is what the docs promise — and the
  // example in coordinate-systems.mdx shows `{ x: 196, y: 379.5 }` round-
  // tripping through `convertCameraPointToViewPoint(convertViewPointTo
  // CameraPoint(...))` for the view center.
  it('maps the view center through Camera coordinates back onto the view center', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const previewOutput = VisionCamera.createPreviewOutput()
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: previewOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])

    let previewRef: PreviewView | undefined
    const previewStarted = deferred()
    const layout = deferred<{ width: number; height: number }>()
    const onError = fn((error: Error) => {
      previewStarted.reject(error)
      layout.reject(error)
    })
    const errorSub = session.addOnErrorListener(onError)

    await render(
      <NativePreviewView
        style={StyleSheet.absoluteFill}
        previewOutput={previewOutput}
        hybridRef={callback((r: PreviewView) => {
          previewRef = r
        })}
        onPreviewStarted={callback(() => {
          previewStarted.resolve()
        })}
        onLayout={(e: LayoutChangeEvent) => {
          layout.resolve({
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          })
        }}
      />,
    )

    await session.start()
    try {
      await withTimeout(layout.promise, 10_000, 'preview view onLayout')
      await withTimeout(previewStarted.promise, 15_000, 'preview started')
      expect(onError).not.toHaveBeenCalled()
      if (previewRef == null) throw new Error('no preview ref')

      const { width: w, height: h } = await layout.promise
      const viewCenter: Point = { x: w / 2, y: h / 2 }
      const cameraPoint = previewRef.convertViewPointToCameraPoint(viewCenter)
      const back = previewRef.convertCameraPointToViewPoint(cameraPoint)
      expect(back.x).toBeCloseTo(viewCenter.x, 0)
      expect(back.y).toBeCloseTo(viewCenter.y, 0)
    } finally {
      errorSub.remove()
      await session.stop()
    }
  })

  // createMeteringPoint should echo the input as `relativeX/Y` per the docs.
  // The normalized side has to land inside [0, 1] by definition (it's
  // "normalized after orientation, cropping, and scaling"). Anything else
  // means the conversion produced a point outside the camera's logical
  // coordinate system.
  it('createMeteringPoint echoes view coords as relative and normalizes camera coords to [0, 1]', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const previewOutput = VisionCamera.createPreviewOutput()
    await session.configure([
      {
        input: backDevice,
        outputs: [{ output: previewOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])

    let previewRef: PreviewView | undefined
    const previewStarted = deferred()
    const layout = deferred<{ width: number; height: number }>()
    const onError = fn((error: Error) => {
      previewStarted.reject(error)
      layout.reject(error)
    })
    const errorSub = session.addOnErrorListener(onError)

    await render(
      <NativePreviewView
        style={StyleSheet.absoluteFill}
        previewOutput={previewOutput}
        hybridRef={callback((r: PreviewView) => {
          previewRef = r
        })}
        onPreviewStarted={callback(() => {
          previewStarted.resolve()
        })}
        onLayout={(e: LayoutChangeEvent) => {
          layout.resolve({
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          })
        }}
      />,
    )

    await session.start()
    try {
      await withTimeout(layout.promise, 10_000, 'preview view onLayout')
      await withTimeout(previewStarted.promise, 15_000, 'preview started')
      expect(onError).not.toHaveBeenCalled()
      if (previewRef == null) throw new Error('no preview ref')

      const { width: w, height: h } = await layout.promise
      const viewCenter: Point = { x: w / 2, y: h / 2 }
      const mp = previewRef.createMeteringPoint(viewCenter.x, viewCenter.y)

      // relativeX/Y is documented to echo the view coordinate the user
      // tapped.
      expect(mp.relativeX).toBeCloseTo(viewCenter.x, 0)
      expect(mp.relativeY).toBeCloseTo(viewCenter.y, 0)

      // normalizedX/Y are the camera-space coords after orientation /
      // cropping / scaling, and per MeteringPoint.nitro.ts must be in [0, 1].
      expect(mp.normalizedX).toBeGreaterThanOrEqual(0)
      expect(mp.normalizedX).toBeLessThanOrEqual(1)
      expect(mp.normalizedY).toBeGreaterThanOrEqual(0)
      expect(mp.normalizedY).toBeLessThanOrEqual(1)

      // The center of the view should map to (approximately) the center of
      // the camera's normalized coord system, since cover/contain crops are
      // symmetric around the center. numDigits=1 tolerates |x - 0.5| < 0.05.
      expect(mp.normalizedX).toBeCloseTo(0.5, 1)
      expect(mp.normalizedY).toBeCloseTo(0.5, 1)
    } finally {
      errorSub.remove()
      await session.stop()
    }
  })

  // Repro for https://github.com/margelo/react-native-vision-camera/issues/3871
  it('round-trips Frame center -> Camera -> View center end-to-end', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const previewOutput = VisionCamera.createPreviewOutput()
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
          { output: previewOutput, mirrorMode: 'auto' },
          { output: frameOutput, mirrorMode: 'auto' },
        ],
        constraints: [],
      },
    ])

    let previewRef: PreviewView | undefined
    const previewStarted = deferred()
    const layout = deferred<{ width: number; height: number }>()
    const onError = fn((error: Error) => {
      previewStarted.reject(error)
      layout.reject(error)
    })
    const errorSub = session.addOnErrorListener(onError)

    await render(
      <NativePreviewView
        style={StyleSheet.absoluteFill}
        previewOutput={previewOutput}
        hybridRef={callback((r: PreviewView) => {
          previewRef = r
        })}
        onPreviewStarted={callback(() => {
          previewStarted.resolve()
        })}
        onLayout={(e: LayoutChangeEvent) => {
          layout.resolve({
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          })
        }}
      />,
    )

    let frameCenterCamera: Point | undefined
    const onSample = (cameraPoint: Point) => {
      frameCenterCamera = cameraPoint
    }

    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      const center = { x: frame.width / 2, y: frame.height / 2 }
      const cameraPoint = frame.convertFramePointToCameraPoint(center)
      scheduleOnRN(onSample, cameraPoint)
      frame.dispose()
    })

    await session.start()
    try {
      await withTimeout(layout.promise, 10_000, 'preview view onLayout')
      await withTimeout(previewStarted.promise, 15_000, 'preview started')
      await waitUntil(
        () => frameCenterCamera != null || onError.mock.calls.length > 0,
        { timeout: 15_000 },
      )
      expect(onError).not.toHaveBeenCalled()
      if (previewRef == null) throw new Error('no preview ref')
      if (frameCenterCamera == null) throw new Error('no frame center sample')

      const { width: w, height: h } = await layout.promise
      const projected =
        previewRef.convertCameraPointToViewPoint(frameCenterCamera)
      const viewCenter: Point = { x: w / 2, y: h / 2 }

      // toBeCloseTo(_, -2) tolerates |projected - center| < 50 (dp), which
      // is loose enough to absorb sub-pixel round-trip drift from two
      // affine transforms and the `resizeMode='cover'` aspect-ratio crop,
      // and tight enough to catch a regression where one platform ignores
      // orientation/mirroring metadata — which produces drift of half the
      // view dimension or more.
      expect(projected.x).toBeCloseTo(viewCenter.x, -2)
      expect(projected.y).toBeCloseTo(viewCenter.y, -2)
    } finally {
      runtime.setOnFrameCallback(frameOutput, undefined)
      errorSub.remove()
      await session.stop()
    }
  })

  // The end-to-end test above projects a single point, and the frame center
  // is a fixed point of any axis-scaling error — an anisotropic Frame ->
  // View mapping still lands the center on the center. Projecting a region
  // catches what a point cannot: a square in Frame space must stay square
  // in View space, because every transform between them (sensor scale,
  // orientation, the preview's aspect-preserving crop) preserves aspect.
  //
  // Camera space itself is allowed to be anisotropic — iOS normalizes
  // per-axis to [0, 1], so a square is not square there — but that is an
  // intermediate representation, and converting out of it must undo the
  // same per-axis scaling it applied. Composing the two public conversions
  // is exactly how callers map a region of interest (a scan guide, a
  // detection box) between the preview and the pixels, so the composition
  // is the contract under test, not either half alone.
  it('maps a square Frame region onto a square View region', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const previewOutput = VisionCamera.createPreviewOutput()
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
          { output: previewOutput, mirrorMode: 'auto' },
          { output: frameOutput, mirrorMode: 'auto' },
        ],
        constraints: [],
      },
    ])

    let previewRef: PreviewView | undefined
    const previewStarted = deferred()
    const layout = deferred<{ width: number; height: number }>()
    const onError = fn((error: Error) => {
      previewStarted.reject(error)
      layout.reject(error)
    })
    const errorSub = session.addOnErrorListener(onError)

    await render(
      <NativePreviewView
        style={StyleSheet.absoluteFill}
        previewOutput={previewOutput}
        hybridRef={callback((r: PreviewView) => {
          previewRef = r
        })}
        onPreviewStarted={callback(() => {
          previewStarted.resolve()
        })}
        onLayout={(e: LayoutChangeEvent) => {
          layout.resolve({
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          })
        }}
      />,
    )

    // Three corners are enough to measure two adjacent edges of the square.
    type SquareCorners = {
      topLeft: Point
      topRight: Point
      bottomLeft: Point
    }
    let cameraCorners: SquareCorners | undefined
    const onCorners = (corners: SquareCorners) => {
      cameraCorners = corners
    }

    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      // A square centered in the frame, kept small so it stays inside the
      // preview's `resizeMode='cover'` crop on any view aspect ratio.
      const side = Math.min(frame.width, frame.height) / 4
      const left = frame.width / 2 - side / 2
      const right = frame.width / 2 + side / 2
      const top = frame.height / 2 - side / 2
      const bottom = frame.height / 2 + side / 2
      scheduleOnRN(onCorners, {
        topLeft: frame.convertFramePointToCameraPoint({ x: left, y: top }),
        topRight: frame.convertFramePointToCameraPoint({ x: right, y: top }),
        bottomLeft: frame.convertFramePointToCameraPoint({
          x: left,
          y: bottom,
        }),
      })
      frame.dispose()
    })

    await session.start()
    try {
      await withTimeout(layout.promise, 10_000, 'preview view onLayout')
      await withTimeout(previewStarted.promise, 15_000, 'preview started')
      await waitUntil(
        () => cameraCorners != null || onError.mock.calls.length > 0,
        { timeout: 15_000 },
      )
      expect(onError).not.toHaveBeenCalled()
      if (previewRef == null) throw new Error('no preview ref')
      const corners = cameraCorners
      if (corners == null) throw new Error('no square corner samples')

      const view = {
        topLeft: previewRef.convertCameraPointToViewPoint(corners.topLeft),
        topRight: previewRef.convertCameraPointToViewPoint(corners.topRight),
        bottomLeft: previewRef.convertCameraPointToViewPoint(
          corners.bottomLeft,
        ),
      }

      // Edge *lengths*, not per-axis deltas: the orientation counter-rotation
      // is free to map the frame's x edge onto the view's y axis, so only the
      // distances are comparable across the two spaces.
      const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
      const topEdge = distance(view.topLeft, view.topRight)
      const leftEdge = distance(view.topLeft, view.bottomLeft)
      expect(topEdge).toBeGreaterThan(0)
      expect(leftEdge).toBeGreaterThan(0)

      // A ratio rather than absolute lengths: the frame resolution and the
      // view size differ per device, but a square is square everywhere.
      // toBeCloseTo(1, 1) tolerates |ratio - 1| < 0.05, which absorbs dp /
      // pixel rounding while still catching an axis-scaling regression.
      const edgeRatio = leftEdge / topEdge
      expect(edgeRatio).toBeCloseTo(1, 1)
    } finally {
      runtime.setOnFrameCallback(frameOutput, undefined)
      errorSub.remove()
      await session.stop()
    }
  })

  // Analyzer coordinates may be reported in the Frame's intended/oriented
  // image space, while Frame.convertFramePointToCameraPoint consumes raw
  // buffer-space points. The center-only test above cannot catch an
  // off-center rectangle drifting after orientation is applied.
  // See https://github.com/margelo/react-native-vision-camera/pull/3878.
  it('maps oriented Frame rectangles into the same Camera bounds', async (context) => {
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

    type Bounds = {
      left: number
      top: number
      right: number
      bottom: number
    }
    type ProjectionReport = {
      orientation: string
      expected: Bounds
      reported: Bounds
    }
    let report: ProjectionReport | undefined
    const onReport = (r: ProjectionReport) => {
      report = r
    }

    const onError = fn<(error: Error) => void>()
    const errorSub = session.addOnErrorListener(onError)

    const runtime = workletsProvider.createRuntimeForThread(frameOutput.thread)
    runtime.setOnFrameCallback(frameOutput, (frame) => {
      'worklet'
      const w = frame.width
      const h = frame.height

      const orientedWidth =
        frame.orientation === 'left' || frame.orientation === 'right' ? h : w
      const orientedHeight =
        frame.orientation === 'left' || frame.orientation === 'right' ? w : h
      const box = {
        left: orientedWidth * 0.34,
        top: orientedHeight * 0.29,
        right: orientedWidth * 0.62,
        bottom: orientedHeight * 0.57,
      }
      const orientedCorners: Point[] = [
        { x: box.left, y: box.top },
        { x: box.right, y: box.top },
        { x: box.right, y: box.bottom },
        { x: box.left, y: box.bottom },
      ]

      const orientedPointToFramePoint = (point: Point): Point => {
        switch (frame.orientation) {
          case 'right':
            return { x: w - point.y, y: point.x }
          case 'left':
            return { x: point.y, y: h - point.x }
          case 'down':
            return { x: w - point.x, y: h - point.y }
          default:
            return point
        }
      }
      const getCameraBounds = (points: Point[]): Bounds => {
        const cameraPoints = points.map((point) =>
          frame.convertFramePointToCameraPoint(point),
        )
        const xs = cameraPoints.map((point) => point.x)
        const ys = cameraPoints.map((point) => point.y)
        return {
          left: Math.min(...xs),
          top: Math.min(...ys),
          right: Math.max(...xs),
          bottom: Math.max(...ys),
        }
      }

      scheduleOnRN(onReport, {
        orientation: frame.orientation,
        expected: getCameraBounds(
          orientedCorners.map(orientedPointToFramePoint),
        ),
        reported: getCameraBounds(orientedCorners),
      })
      frame.dispose()
    })

    await session.start()
    try {
      await waitUntil(() => report != null || onError.mock.calls.length > 0, {
        timeout: 15_000,
      })
      expect(onError).not.toHaveBeenCalled()
      const r = report
      if (r == null) throw new Error('no rectangle projection report')

      if (r.orientation === 'up') {
        return context.skip(
          'oriented rectangle projection: frame orientation is up',
        )
      }

      for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
        expect(r.reported[edge]).toBeCloseTo(r.expected[edge], 0)
      }
    } finally {
      runtime.setOnFrameCallback(frameOutput, undefined)
      errorSub.remove()
      await session.stop()
    }
  })

  // TODO: Re-enable once we have a way to produce a ScannedObject without a
  //       real on-device scan (e.g. a `createMockScannedObject` factory or
  //       a CI-friendly QR fixture). On iOS, the only way to obtain a
  //       ScannedObject today is via `CameraObjectOutput`, which depends
  //       on a real QR code being visible to the rear camera — not
  //       reliable on AWS Device Farm or a closed test rig.
  it.skip("converts a ScannedObject's bounding box into view coordinates (iOS only)", async (context) => {
    if (Platform.OS !== 'ios') {
      return context.skip(
        'convertScannedObjectCoordinatesToViewCoordinates: iOS only',
      )
    }
    // Pending API: a way to mint a ScannedObject without a live scan.
  })
})
