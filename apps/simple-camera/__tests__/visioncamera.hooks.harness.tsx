import {
  Activity,
  Component,
  type ErrorInfo,
  type ReactNode,
  StrictMode,
  Suspense,
  use,
  useEffect,
  useState,
} from 'react'
import { Platform, StyleSheet } from 'react-native'
import {
  assert,
  beforeAll,
  describe,
  expect,
  fn,
  it,
  type Mock,
  render,
  waitFor,
} from 'react-native-harness'
import { NitroModules } from 'react-native-nitro-modules'
import {
  Screen,
  type ScreenOrientationTypes,
  ScreenStack,
} from 'react-native-screens'
import type {
  CameraDevice,
  CameraDeviceFactory,
  CameraFrameOutput,
  CameraOrientation,
  CameraPhotoOutput,
  CameraPosition,
  CameraVideoOutput,
  DeviceFilter,
  Frame,
  TargetCameraPosition,
  TargetVideoPixelFormat,
} from 'react-native-vision-camera'
import {
  CommonResolutions,
  getUIRotation,
  useCamera,
  useCameraDevice,
  useFrameOutput,
  useOrientation,
  usePhotoOutput,
  usePreviewOutput,
  useVideoOutput,
  VisionCamera,
} from 'react-native-vision-camera'
import {
  createWorkletRuntimeForThread,
  getCurrentThreadMarker,
} from 'react-native-vision-camera-worklets'
import { scheduleOnRN, scheduleOnRuntime } from 'react-native-worklets'
import { deferred, withTimeout } from './test-utils'

// Mirrors `IdentifiableExecutor.IDLE_THREAD_TIMEOUT_MS` on Android.
const FRAME_THREAD_IDLE_TIMEOUT_MS = 5_000

interface RecordingErrorBoundaryProps {
  onError: (error: Error, errorInfo: ErrorInfo) => void
  children?: ReactNode
}

// Catches errors below the harness ErrorBoundary, which would
// otherwise remount the tree and hide them.
class RecordingErrorBoundary extends Component<
  RecordingErrorBoundaryProps,
  { hasError: boolean }
> {
  override state = { hasError: false }
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }
  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError(error, errorInfo)
  }
  override render(): ReactNode {
    return this.state.hasError ? null : this.props.children
  }
}

interface DeviceSnapshot {
  requestedPosition: TargetCameraPosition
  deviceId: string | undefined
  devicePosition: CameraPosition | undefined
}

interface CameraDeviceProbeProps {
  position: TargetCameraPosition
  filter?: DeviceFilter
  onSnapshot: (snapshot: DeviceSnapshot) => void
}

const cameraPositions: TargetCameraPosition[] = ['back', 'front', 'external']
const tripleCameraFilter = {
  physicalDevices: ['ultra-wide-angle', 'wide-angle', 'telephoto'],
} satisfies DeviceFilter
const wideCameraFilter = {
  physicalDevices: ['wide-angle'],
} satisfies DeviceFilter

function getExpectedCameraDevice(
  factory: CameraDeviceFactory,
  position: TargetCameraPosition,
  filter: DeviceFilter = {},
): CameraDevice | undefined {
  if (Object.values(filter).length === 0) {
    const defaultCamera = factory.getDefaultCamera(position)
    if (defaultCamera != null) return defaultCamera
  }

  return factory.cameraDevices
    .filter((device) => device.position === position)
    .reduce<CameraDevice | undefined>((previous, current) => {
      if (previous == null) return current

      const physicalDevicesFilter: string[] = filter.physicalDevices ?? [
        'wide-angle',
      ]
      const previousPoints = previous.physicalDevices.reduce(
        (points, physicalDevice) =>
          physicalDevicesFilter.includes(physicalDevice.type)
            ? points + 1
            : points - 1,
        0,
      )
      const currentPoints = current.physicalDevices.reduce(
        (points, physicalDevice) =>
          physicalDevicesFilter.includes(physicalDevice.type)
            ? points + 1
            : points - 1,
        0,
      )

      return currentPoints > previousPoints ? current : previous
    }, undefined)
}

function CameraDeviceProbe({
  position,
  filter,
  onSnapshot,
}: CameraDeviceProbeProps): null {
  const device = useCameraDevice(position, filter)

  useEffect(() => {
    onSnapshot({
      requestedPosition: position,
      deviceId: device?.id,
      devicePosition: device?.position,
    })
  }, [position, device, onSnapshot])

  return null
}

async function expectLatestDeviceSnapshot(
  onSnapshot: Mock<(snapshot: DeviceSnapshot) => void>,
  position: TargetCameraPosition,
  expectedDevice: CameraDevice | undefined,
): Promise<void> {
  await waitFor(
    () => {
      expect(onSnapshot).toHaveBeenLastCalledWith({
        requestedPosition: position,
        deviceId: expectedDevice?.id,
        devicePosition: expectedDevice?.position,
      })
    },
    { timeout: 10_000 },
  )
}

describe('VisionCamera - Hooks', () => {
  let factory: CameraDeviceFactory

  beforeAll(async () => {
    await VisionCamera.requestCameraPermission()
    expect(VisionCamera.cameraPermissionStatus).toBe('authorized')
    factory = await VisionCamera.createDeviceFactory()
  })

  it('updates useCameraDevice when the requested position changes', async () => {
    const onSnapshot = fn<(snapshot: DeviceSnapshot) => void>()

    const { rerender } = await render(
      <CameraDeviceProbe position="back" onSnapshot={onSnapshot} />,
    )

    for (const position of cameraPositions) {
      if (position !== 'back') {
        await rerender(
          <CameraDeviceProbe position={position} onSnapshot={onSnapshot} />,
        )
      }

      await expectLatestDeviceSnapshot(
        onSnapshot,
        position,
        getExpectedCameraDevice(factory, position),
      )
    }
  })

  it('updates useCameraDevice when the requested position changes with a physical-device filter', async () => {
    const onSnapshot = fn<(snapshot: DeviceSnapshot) => void>()

    const { rerender } = await render(
      <CameraDeviceProbe
        position="back"
        filter={tripleCameraFilter}
        onSnapshot={onSnapshot}
      />,
    )

    for (const position of cameraPositions) {
      if (position !== 'back') {
        await rerender(
          <CameraDeviceProbe
            position={position}
            filter={tripleCameraFilter}
            onSnapshot={onSnapshot}
          />,
        )
      }

      await expectLatestDeviceSnapshot(
        onSnapshot,
        position,
        getExpectedCameraDevice(factory, position, tripleCameraFilter),
      )
    }
  })

  it('updates useCameraDevice when the physical-device filter changes', async (context) => {
    const wideDevice = getExpectedCameraDevice(
      factory,
      'back',
      wideCameraFilter,
    )
    const tripleDevice = getExpectedCameraDevice(
      factory,
      'back',
      tripleCameraFilter,
    )

    if (wideDevice == null || tripleDevice == null) {
      return context.skip(
        'filtered back cameras: none available on this device',
      )
    }
    if (wideDevice.id === tripleDevice.id) {
      return context.skip(
        'filtered back cameras: wide-angle and triple filters select the same device',
      )
    }

    const onSnapshot = fn<(snapshot: DeviceSnapshot) => void>()

    const { rerender } = await render(
      <CameraDeviceProbe
        position="back"
        filter={wideCameraFilter}
        onSnapshot={onSnapshot}
      />,
    )
    await expectLatestDeviceSnapshot(onSnapshot, 'back', wideDevice)

    await rerender(
      <CameraDeviceProbe
        position="back"
        filter={tripleCameraFilter}
        onSnapshot={onSnapshot}
      />,
    )
    await expectLatestDeviceSnapshot(onSnapshot, 'back', tripleDevice)
  })

  it('updates onUIRotationChanged when the interface orientation changes', async () => {
    const onConfigured = fn<() => void>()
    const onInterfaceOrientationChanged =
      fn<(orientation: CameraOrientation | undefined) => void>()
    const onUIRotationChanged = fn<(rotation: number) => void>()
    const onError = fn<(error: Error) => void>()

    function TestCamera({
      screenOrientation,
    }: {
      screenOrientation: ScreenOrientationTypes
    }): React.ReactElement {
      // CameraX requires at least one use case when configuring a session.
      const previewOutput = usePreviewOutput()
      const interfaceOrientation = useOrientation('interface')
      useEffect(() => {
        onInterfaceOrientationChanged(interfaceOrientation)
      }, [interfaceOrientation])
      useCamera({
        isActive: false,
        device: 'back',
        outputs: [previewOutput],
        orientationSource: 'custom',
        onConfigured,
        onUIRotationChanged,
        onError,
      })

      return (
        <ScreenStack style={StyleSheet.absoluteFill}>
          <Screen
            enabled={true}
            activityState={2}
            screenOrientation={screenOrientation}
            style={StyleSheet.absoluteFill}
          />
        </ScreenStack>
      )
    }

    const waitForRotation = async (
      allowedOrientations: readonly CameraOrientation[],
    ): Promise<CameraOrientation> => {
      let receivedOrientation: CameraOrientation | undefined
      await waitFor(
        () => {
          const error = onError.mock.lastCall?.[0]
          if (error != null) throw error

          const orientation = onInterfaceOrientationChanged.mock.lastCall?.[0]
          if (orientation == null) {
            throw new Error('No interface orientation was received yet.')
          }
          receivedOrientation = orientation
          expect(allowedOrientations).toContain(orientation)
          const expectedRotation = getUIRotation('up', orientation)
          expect(onUIRotationChanged).toHaveBeenLastCalledWith(expectedRotation)
        },
        { timeout: 10_000 },
      )
      if (receivedOrientation == null) {
        throw new Error('No interface orientation was received.')
      }
      return receivedOrientation
    }

    const { rerender } = await render(
      <TestCamera screenOrientation="portrait_up" />,
      {
        timeout: 10_000,
      },
    )
    await waitFor(
      () => {
        const error = onError.mock.lastCall?.[0]
        if (error != null) throw error
        expect(onConfigured).toHaveBeenCalledTimes(1)
      },
      { timeout: 10_000 },
    )
    await waitFor(
      () => {
        const error = onError.mock.lastCall?.[0]
        if (error != null) throw error
        const expectedRotation = getUIRotation('up', 'up')
        expect(onUIRotationChanged).toHaveBeenLastCalledWith(expectedRotation)
      },
      { timeout: 10_000 },
    )

    try {
      onInterfaceOrientationChanged.mockClear()
      onUIRotationChanged.mockClear()
      await rerender(<TestCamera screenOrientation="landscape_left" />)
      const firstLandscapeOrientation = await waitForRotation(['left', 'right'])
      const oppositeLandscapeOrientation =
        firstLandscapeOrientation === 'left' ? 'right' : 'left'
      onInterfaceOrientationChanged.mockClear()
      onUIRotationChanged.mockClear()
      await rerender(<TestCamera screenOrientation="landscape_right" />)
      await waitForRotation([oppositeLandscapeOrientation])

      onInterfaceOrientationChanged.mockClear()
      onUIRotationChanged.mockClear()
      await rerender(<TestCamera screenOrientation="portrait_up" />)
      await waitForRotation(['up'])
    } finally {
      await rerender(<TestCamera screenOrientation="portrait_up" />)
    }

    expect(onError).not.toHaveBeenCalled()
  })

  it('keeps outputs stable when targetResolution is passed as an inline object literal', async () => {
    const onConfigured = fn<() => void>()
    const onError = fn<(error: Error) => void>()
    const onRendered =
      fn<
        (
          renderIndex: number,
          photoOutput: CameraPhotoOutput,
          videoOutput: CameraVideoOutput,
        ) => void
      >()

    function TestCamera({
      renderIndex,
      width,
      height,
    }: {
      renderIndex: number
      width: number
      height: number
    }): null {
      // CameraX requires at least one use case when configuring a session.
      const previewOutput = usePreviewOutput()
      // Both `targetResolution`s are inline object literals, so they have a
      // fresh identity on every single render even though their values never
      // change. They must not re-create the outputs.
      const photoOutput = usePhotoOutput({
        targetResolution: { width: width, height: height },
      })
      const videoOutput = useVideoOutput({
        targetResolution: { width: width, height: height },
        enableAudio: false,
      })
      useCamera({
        isActive: false,
        device: 'back',
        outputs: [previewOutput, photoOutput, videoOutput],
        onConfigured,
        onError,
      })

      useEffect(() => {
        onRendered(renderIndex, photoOutput, videoOutput)
      }, [renderIndex, photoOutput, videoOutput])

      return null
    }

    const waitForRender = async (renderIndex: number): Promise<void> => {
      await waitFor(
        () => {
          const error = onError.mock.lastCall?.[0]
          if (error != null) throw error
          expect(onRendered.mock.lastCall?.[0]).toBe(renderIndex)
        },
        { timeout: 10_000 },
      )
    }

    const stableResolution = CommonResolutions.HD_4_3
    const changedResolution = CommonResolutions.VGA_4_3

    const { rerender } = await render(
      <TestCamera
        renderIndex={0}
        width={stableResolution.width}
        height={stableResolution.height}
      />,
      { timeout: 10_000 },
    )
    await waitForRender(0)
    await waitFor(
      () => {
        const error = onError.mock.lastCall?.[0]
        if (error != null) throw error
        expect(onConfigured).toHaveBeenCalledTimes(1)
      },
      { timeout: 15_000 },
    )

    const initialPhotoOutput = onRendered.mock.lastCall?.[1]
    const initialVideoOutput = onRendered.mock.lastCall?.[2]
    expect(initialPhotoOutput).toBeDefined()
    expect(initialVideoOutput).toBeDefined()

    // Re-rendering with the same resolution values must reuse the same outputs.
    for (const renderIndex of [1, 2, 3]) {
      await rerender(
        <TestCamera
          renderIndex={renderIndex}
          width={stableResolution.width}
          height={stableResolution.height}
        />,
      )
      await waitForRender(renderIndex)
      expect(onRendered.mock.lastCall?.[1]).toBe(initialPhotoOutput)
      expect(onRendered.mock.lastCall?.[2]).toBe(initialVideoOutput)
    }

    // Changing the actual resolution values must re-create the outputs and
    // re-configure the session exactly once more.
    await rerender(
      <TestCamera
        renderIndex={4}
        width={changedResolution.width}
        height={changedResolution.height}
      />,
    )
    await waitForRender(4)
    expect(onRendered.mock.lastCall?.[1]).not.toBe(initialPhotoOutput)
    expect(onRendered.mock.lastCall?.[2]).not.toBe(initialVideoOutput)
    await waitFor(
      () => {
        const error = onError.mock.lastCall?.[0]
        if (error != null) throw error
        expect(onConfigured).toHaveBeenCalledTimes(2)
      },
      { timeout: 15_000 },
    )

    expect(onError).not.toHaveBeenCalled()
  })

  it('does not re-configure the session when constraints are passed as an inline array', async () => {
    const onConfigured = fn<() => void>()
    const onError = fn<(error: Error) => void>()
    const onRendered = fn<(renderIndex: number) => void>()

    function TestCamera({
      renderIndex,
      fps,
    }: {
      renderIndex: number
      fps: number
    }): null {
      // CameraX requires at least one use case when configuring a session.
      const previewOutput = usePreviewOutput()
      useCamera({
        isActive: false,
        device: 'back',
        outputs: [previewOutput],
        // An inline array of inline object literals, so `constraints` has a
        // fresh identity on every single render even though its values never
        // change. It must not re-configure the session.
        constraints: [{ fps: fps }],
        onConfigured,
        onError,
      })

      useEffect(() => {
        onRendered(renderIndex)
      }, [renderIndex])

      return null
    }

    const waitForRender = async (renderIndex: number): Promise<void> => {
      await waitFor(
        () => {
          const error = onError.mock.lastCall?.[0]
          if (error != null) throw error
          expect(onRendered).toHaveBeenLastCalledWith(renderIndex)
        },
        { timeout: 10_000 },
      )
    }

    const { rerender } = await render(<TestCamera renderIndex={0} fps={30} />, {
      timeout: 10_000,
    })
    await waitForRender(0)
    await waitFor(
      () => {
        const error = onError.mock.lastCall?.[0]
        if (error != null) throw error
        expect(onConfigured).toHaveBeenCalledTimes(1)
      },
      { timeout: 15_000 },
    )

    // Re-rendering with the same constraint values must not re-configure.
    for (const renderIndex of [1, 2, 3]) {
      await rerender(<TestCamera renderIndex={renderIndex} fps={30} />)
      await waitForRender(renderIndex)
      expect(onConfigured).toHaveBeenCalledTimes(1)
    }

    // Changing the actual constraint values must re-configure exactly once more.
    await rerender(<TestCamera renderIndex={4} fps={24} />)
    await waitForRender(4)
    await waitFor(
      () => {
        const error = onError.mock.lastCall?.[0]
        if (error != null) throw error
        expect(onConfigured).toHaveBeenCalledTimes(2)
      },
      { timeout: 15_000 },
    )

    expect(onError).not.toHaveBeenCalled()
  })

  it('re-configures the session when a resolutionBias constraint points at a different output', async () => {
    // Two outputs of the same HybridObject type. They are only used as
    // resolution hints, so the attached `outputs` stay identical across every
    // re-render and the `constraints` are the only thing that changes.
    const lowResolutionBias = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.VGA_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    const highResolutionBias = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.UHD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    const onConfigured = fn<() => void>()
    const onError = fn<(error: Error) => void>()
    const onRendered = fn<(renderIndex: number) => void>()

    function TestCamera({
      renderIndex,
      resolutionBias,
    }: {
      renderIndex: number
      resolutionBias: CameraPhotoOutput
    }): null {
      // CameraX requires at least one use case when configuring a session.
      const previewOutput = usePreviewOutput()
      useCamera({
        isActive: false,
        device: 'back',
        outputs: [previewOutput],
        constraints: [{ resolutionBias: resolutionBias }],
        onConfigured,
        onError,
      })

      useEffect(() => {
        onRendered(renderIndex)
      }, [renderIndex])

      return null
    }

    const waitForRender = async (renderIndex: number): Promise<void> => {
      await waitFor(
        () => {
          const error = onError.mock.lastCall?.[0]
          if (error != null) throw error
          expect(onRendered).toHaveBeenLastCalledWith(renderIndex)
        },
        { timeout: 10_000 },
      )
    }

    const { rerender } = await render(
      <TestCamera renderIndex={0} resolutionBias={lowResolutionBias} />,
      { timeout: 10_000 },
    )
    await waitForRender(0)
    await waitFor(
      () => {
        const error = onError.mock.lastCall?.[0]
        if (error != null) throw error
        expect(onConfigured).toHaveBeenCalledTimes(1)
      },
      { timeout: 15_000 },
    )

    // Re-rendering with the same output must not re-configure.
    await rerender(
      <TestCamera renderIndex={1} resolutionBias={lowResolutionBias} />,
    )
    await waitForRender(1)
    expect(onConfigured).toHaveBeenCalledTimes(1)

    // Pointing the bias at a different output must re-configure exactly once
    // more, even though both outputs are the same HybridObject type.
    await rerender(
      <TestCamera renderIndex={2} resolutionBias={highResolutionBias} />,
    )
    await waitForRender(2)
    await waitFor(
      () => {
        const error = onError.mock.lastCall?.[0]
        if (error != null) throw error
        expect(onConfigured).toHaveBeenCalledTimes(2)
      },
      { timeout: 15_000 },
    )

    expect(onError).not.toHaveBeenCalled()
  })

  // Red before (head 441123f8): `expect(NitroModules.isHybridObject(frameOutput)).toBe(true)`
  // - the hook disposed its output one microtask after the unmount cleanup.
  it('keeps the useFrameOutput output usable after the component unmounts', async () => {
    const onFrameOutput = fn<(frameOutput: CameraFrameOutput) => void>()
    const onUnmounted = fn<() => void>()

    function TestFrameOutput(): null {
      const frameOutput = useFrameOutput({
        onFrame(frame) {
          'worklet'
          frame.dispose()
        },
      })
      useEffect(() => {
        onFrameOutput(frameOutput)
      }, [frameOutput])
      useEffect(() => onUnmounted, [])
      return null
    }

    const { unmount } = await render(<TestFrameOutput />)
    await waitFor(() => {
      expect(onFrameOutput).toHaveBeenCalledTimes(1)
    })
    const frameOutput = onFrameOutput.mock.lastCall?.[0]
    assert.exists(frameOutput, 'useFrameOutput did not return an output')

    unmount()
    await waitFor(() => {
      expect(onUnmounted).toHaveBeenCalledTimes(1)
    })

    expect(NitroModules.isHybridObject(frameOutput)).toBe(true)
    const ranAfterUnmount = deferred()
    frameOutput.thread.runOnThread(() => ranAfterUnmount.resolve())
    await withTimeout(
      ranAfterUnmount.promise,
      5_000,
      'run on the frame output thread after unmount',
    )
  })

  // Red before (head 441123f8): the second `readThreadMarker()` rejects with
  // "Timed out after 5000ms: read the frame thread marker" - the disposed
  // output's thread dropped the probe job. On main, `markerAfterIdle` equals
  // `markerBeforeIdle`.
  it('lets the useFrameOutput thread exit after the component unmounts', async (context) => {
    if (Platform.OS !== 'android') {
      return context.skip(
        'idle thread exit: Android only, only Android gives each output its own OS thread',
      )
    }
    const onFrameOutput = fn<(frameOutput: CameraFrameOutput) => void>()
    const onUnmounted = fn<() => void>()

    function TestFrameOutput(): null {
      const frameOutput = useFrameOutput({
        onFrame(frame) {
          'worklet'
          frame.dispose()
        },
      })
      useEffect(() => {
        onFrameOutput(frameOutput)
      }, [frameOutput])
      useEffect(() => onUnmounted, [])
      return null
    }

    const { unmount } = await render(<TestFrameOutput />)
    await waitFor(() => {
      expect(onFrameOutput).toHaveBeenCalledTimes(1)
    })
    const frameOutput = onFrameOutput.mock.lastCall?.[0]
    assert.exists(frameOutput, 'useFrameOutput did not return an output')
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
    unmount()
    await waitFor(() => {
      expect(onUnmounted).toHaveBeenCalledTimes(1)
    })
    // Elapsed idle time is the behavior under test. Nothing may touch the
    // thread during the wait, because each job restarts the idle timer.
    await new Promise<void>((resolve) =>
      setTimeout(resolve, FRAME_THREAD_IDLE_TIMEOUT_MS + 2_000),
    )
    const markerAfterIdle = await readThreadMarker()

    expect(markerAfterIdle).not.toBe(markerBeforeIdle)
  })

  // Red before (head 441123f8): `expect(onFrameOutput.mock.lastCall?.[1]).toBe(hiddenFrameOutput)`
  // - the hook replaced its disposed output after the reveal.
  it('keeps the same working useFrameOutput output after <Activity> hides and shows it', async () => {
    const onFrameOutput =
      fn<(instanceId: number, frameOutput: CameraFrameOutput) => void>()
    const onError = fn<(error: Error, errorInfo: ErrorInfo) => void>()
    let mountCount = 0

    function TestFrameOutput(): null {
      const [instanceId] = useState(() => ++mountCount)
      const frameOutput = useFrameOutput({
        onFrame(frame) {
          'worklet'
          frame.dispose()
        },
      })
      useEffect(() => {
        onFrameOutput(instanceId, frameOutput)
      }, [instanceId, frameOutput])
      return null
    }

    const renderTree = (mode: 'visible' | 'hidden') => (
      <RecordingErrorBoundary onError={onError}>
        <Activity mode={mode}>
          <TestFrameOutput />
        </Activity>
      </RecordingErrorBoundary>
    )

    const { rerender } = await render(renderTree('visible'))
    await waitFor(() => {
      expect(onFrameOutput).toHaveBeenCalledTimes(1)
    })
    const hiddenFrameOutput = onFrameOutput.mock.lastCall?.[1]
    assert.exists(hiddenFrameOutput, 'useFrameOutput did not return an output')

    await rerender(renderTree('hidden'))
    // Let any deferred work from the hide run before the output is shown again.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await rerender(renderTree('visible'))

    // The reveal re-runs the effect once.
    await waitFor(() => {
      expect(onFrameOutput).toHaveBeenCalledTimes(2)
    })
    expect(onError).not.toHaveBeenCalled()
    expect(onFrameOutput.mock.lastCall?.[1]).toBe(hiddenFrameOutput)
    // Same component instance: no remount happened during hide and show.
    const firstInstanceId = onFrameOutput.mock.calls[0]?.[0]
    const instanceIds = onFrameOutput.mock.calls.map(([id]) => id)
    expect(instanceIds).toEqual([firstInstanceId, firstInstanceId])

    const ranOnShownThread = deferred()
    hiddenFrameOutput.thread.runOnThread(() => ranOnShownThread.resolve())
    await withTimeout(
      ranOnShownThread.promise,
      5_000,
      'run on the shown frame output thread',
    )
  })

  // Red before (head 441123f8): `expect(onError).not.toHaveBeenCalled()` - on
  // the effect-only reveal, Child's effect ran first on the disposed output,
  // and its `outputOrientation` setter threw a JSError into the boundary.
  it('hands child effects a live useFrameOutput output on an effect-only <Activity> reveal', async () => {
    const onChildEffect =
      fn<(isHybridObject: boolean, output: CameraFrameOutput) => void>()
    const onError = fn<(error: Error, errorInfo: ErrorInfo) => void>()
    let parentRenderCount = 0

    function Child({ output }: { output: CameraFrameOutput }): null {
      useEffect(() => {
        onChildEffect(NitroModules.isHybridObject(output), output)
        output.outputOrientation = 'up'
      }, [output])
      return null
    }

    function Parent(): ReactNode {
      parentRenderCount++
      const frameOutput = useFrameOutput({
        onFrame(frame) {
          'worklet'
          frame.dispose()
        },
      })
      return <Child output={frameOutput} />
    }

    // Created once, so the reveal bails out of rendering Parent and only
    // reconnects the committed effects.
    const parent = <Parent />
    const renderTree = (mode: 'visible' | 'hidden') => (
      <RecordingErrorBoundary onError={onError}>
        <Activity mode={mode}>{parent}</Activity>
      </RecordingErrorBoundary>
    )

    const { rerender } = await render(renderTree('visible'))
    await waitFor(() => {
      expect(onChildEffect).toHaveBeenCalledTimes(1)
    })
    const mountedOutput = onChildEffect.mock.lastCall?.[1]
    assert.exists(mountedOutput, 'useFrameOutput did not return an output')

    await rerender(renderTree('hidden'))
    // Let any deferred work from the hide run before the reveal.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    const parentRendersBeforeReveal = parentRenderCount
    await rerender(renderTree('visible'))
    await waitFor(() => {
      expect(onChildEffect).toHaveBeenCalledTimes(2)
    })

    expect(onError).not.toHaveBeenCalled()
    expect(parentRenderCount).toBe(parentRendersBeforeReveal)
    const recordedLiveness = onChildEffect.mock.calls.map(([isLive]) => isLive)
    expect(recordedLiveness).toEqual([true, true])
    expect(onChildEffect.mock.lastCall?.[1]).toBe(mountedOutput)
  })

  // Red before (head 441123f8): `expect(NitroModules.isHybridObject(firstOutput)).toBe(true)`
  // - the hook disposed the first output at the hide.
  it('keeps both outputs usable when a hidden re-render changes options and the tree unmounts while hidden', async () => {
    const onRenderedOutput = fn<(frameOutput: CameraFrameOutput) => void>()
    const onError = fn<(error: Error, errorInfo: ErrorInfo) => void>()

    function TestFrameOutput({
      pixelFormat,
    }: {
      pixelFormat: TargetVideoPixelFormat
    }): null {
      const frameOutput = useFrameOutput({
        pixelFormat: pixelFormat,
        onFrame(frame) {
          'worklet'
          frame.dispose()
        },
      })
      onRenderedOutput(frameOutput)
      return null
    }

    const renderTree = (
      mode: 'visible' | 'hidden',
      pixelFormat: TargetVideoPixelFormat,
    ) => (
      <RecordingErrorBoundary onError={onError}>
        <Activity mode={mode}>
          <TestFrameOutput pixelFormat={pixelFormat} />
        </Activity>
      </RecordingErrorBoundary>
    )

    const { rerender } = await render(renderTree('visible', 'yuv'))
    const firstOutput = onRenderedOutput.mock.lastCall?.[0]
    assert.exists(firstOutput, 'useFrameOutput did not return an output')

    await rerender(renderTree('hidden', 'yuv'))
    await rerender(renderTree('hidden', 'native'))
    // React renders a hidden subtree at a lower priority.
    await waitFor(
      () => {
        expect(onRenderedOutput.mock.lastCall?.[0]).not.toBe(firstOutput)
      },
      { timeout: 5_000 },
    )
    const hiddenOutput = onRenderedOutput.mock.lastCall?.[0]
    assert.exists(hiddenOutput, 'useFrameOutput did not return an output')
    await rerender(<RecordingErrorBoundary onError={onError} />)

    expect(NitroModules.isHybridObject(firstOutput)).toBe(true)
    expect(NitroModules.isHybridObject(hiddenOutput)).toBe(true)
    expect(hiddenOutput).not.toBe(firstOutput)
    expect(onError).not.toHaveBeenCalled()
  })

  // Red before (head 441123f8): the second `readThreadMarker()` rejects with
  // "Timed out after 5000ms: read the frame thread marker" - the hide disposed
  // the first output, so its thread dropped the probe job. On main,
  // `markerAfterIdle` equals `markerBeforeIdle`.
  it('lets the useFrameOutput thread exit when the tree unmounts while hidden', async (context) => {
    if (Platform.OS !== 'android') {
      return context.skip(
        'idle thread exit: Android only, only Android gives each output its own OS thread',
      )
    }
    const onRenderedOutput = fn<(frameOutput: CameraFrameOutput) => void>()
    const onError = fn<(error: Error, errorInfo: ErrorInfo) => void>()

    function TestFrameOutput({
      pixelFormat,
    }: {
      pixelFormat: TargetVideoPixelFormat
    }): null {
      const frameOutput = useFrameOutput({
        pixelFormat: pixelFormat,
        onFrame(frame) {
          'worklet'
          frame.dispose()
        },
      })
      onRenderedOutput(frameOutput)
      return null
    }

    const renderTree = (
      mode: 'visible' | 'hidden',
      pixelFormat: TargetVideoPixelFormat,
    ) => (
      <RecordingErrorBoundary onError={onError}>
        <Activity mode={mode}>
          <TestFrameOutput pixelFormat={pixelFormat} />
        </Activity>
      </RecordingErrorBoundary>
    )

    const { rerender } = await render(renderTree('visible', 'yuv'))
    const firstOutput = onRenderedOutput.mock.lastCall?.[0]
    assert.exists(firstOutput, 'useFrameOutput did not return an output')
    const probe = createWorkletRuntimeForThread(firstOutput.thread)
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
    await rerender(renderTree('hidden', 'yuv'))
    await rerender(renderTree('hidden', 'native'))
    // React renders a hidden subtree at a lower priority.
    await waitFor(
      () => {
        expect(onRenderedOutput.mock.lastCall?.[0]).not.toBe(firstOutput)
      },
      { timeout: 5_000 },
    )
    await rerender(<RecordingErrorBoundary onError={onError} />)
    // Elapsed idle time is the behavior under test. Nothing may touch the
    // thread during the wait, because each job restarts the idle timer.
    await new Promise<void>((resolve) =>
      setTimeout(resolve, FRAME_THREAD_IDLE_TIMEOUT_MS + 2_000),
    )
    const markerAfterIdle = await readThreadMarker()

    expect(markerAfterIdle).not.toBe(markerBeforeIdle)
    expect(onError).not.toHaveBeenCalled()
  })

  // Red before (head 441123f8): `expect(NitroModules.isHybridObject(firstOutput)).toBe(true)`
  // - the hook disposed the first output one microtask after the replacement.
  it('keeps the previous useFrameOutput output usable after an options change', async () => {
    const onFrameOutput = fn<(frameOutput: CameraFrameOutput) => void>()

    function TestFrameOutput({
      pixelFormat,
    }: {
      pixelFormat: TargetVideoPixelFormat
    }): null {
      const frameOutput = useFrameOutput({
        pixelFormat: pixelFormat,
        onFrame(frame) {
          'worklet'
          frame.dispose()
        },
      })
      useEffect(() => {
        onFrameOutput(frameOutput)
      }, [frameOutput])
      return null
    }

    const { rerender } = await render(<TestFrameOutput pixelFormat="yuv" />)
    await waitFor(() => {
      expect(onFrameOutput).toHaveBeenCalledTimes(1)
    })
    const firstOutput = onFrameOutput.mock.lastCall?.[0]
    assert.exists(firstOutput, 'useFrameOutput did not return an output')

    await rerender(<TestFrameOutput pixelFormat="native" />)
    await waitFor(() => {
      expect(onFrameOutput.mock.lastCall?.[0]).not.toBe(firstOutput)
    })
    const secondOutput = onFrameOutput.mock.lastCall?.[0]
    assert.exists(secondOutput, 'useFrameOutput did not return an output')
    const ranOnSecondThread = deferred()
    secondOutput.thread.runOnThread(() => ranOnSecondThread.resolve())
    await withTimeout(
      ranOnSecondThread.promise,
      5_000,
      'run on the second frame output thread',
    )

    expect(NitroModules.isHybridObject(firstOutput)).toBe(true)
  })

  // Guard: green before and after. Red if the hook touches an output that the
  // user disposed.
  it('guard: throws nothing from useFrameOutput after the user disposes its output', async () => {
    const onFrameOutput = fn<(frameOutput: CameraFrameOutput) => void>()
    const onError = fn<(error: Error, errorInfo: ErrorInfo) => void>()
    const onFrameA = (frame: Frame) => {
      'worklet'
      frame.dispose()
    }
    const onFrameB = (frame: Frame) => {
      'worklet'
      frame.dispose()
    }

    function TestFrameOutput({
      onFrame,
    }: {
      onFrame: (frame: Frame) => void
    }): null {
      const frameOutput = useFrameOutput({ onFrame: onFrame })
      useEffect(() => {
        onFrameOutput(frameOutput)
      }, [frameOutput])
      return null
    }

    const { rerender } = await render(
      <RecordingErrorBoundary onError={onError}>
        <TestFrameOutput onFrame={onFrameA} />
      </RecordingErrorBoundary>,
    )
    await waitFor(() => {
      expect(onFrameOutput).toHaveBeenCalledTimes(1)
    })
    const frameOutput = onFrameOutput.mock.lastCall?.[0]
    assert.exists(frameOutput, 'useFrameOutput did not return an output')

    frameOutput.dispose()
    await rerender(
      <RecordingErrorBoundary onError={onError}>
        <TestFrameOutput onFrame={onFrameB} />
      </RecordingErrorBoundary>,
    )
    await rerender(<RecordingErrorBoundary onError={onError} />)
    // Let the unmount cleanups and any deferred work run.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(onError).not.toHaveBeenCalled()
  })

  // Guard: green before and after. StrictMode re-runs the effects with the
  // same output, which must stay usable.
  it('guard: keeps one working useFrameOutput output under <StrictMode>', async () => {
    const onFrameOutput = fn<(frameOutput: CameraFrameOutput) => void>()

    function TestFrameOutput(): null {
      const frameOutput = useFrameOutput({
        onFrame(frame) {
          'worklet'
          frame.dispose()
        },
      })
      useEffect(() => {
        onFrameOutput(frameOutput)
      }, [frameOutput])
      return null
    }

    await render(
      <StrictMode>
        <TestFrameOutput />
      </StrictMode>,
    )
    await waitFor(() => {
      expect(onFrameOutput).toHaveBeenCalled()
    })
    // Let any deferred work from the StrictMode effect re-run finish.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    const distinctOutputs = new Set(
      onFrameOutput.mock.calls.map(([output]) => output),
    )
    expect(distinctOutputs.size).toBe(1)
    const frameOutput = onFrameOutput.mock.lastCall?.[0]
    assert.exists(frameOutput, 'useFrameOutput did not return an output')
    expect(NitroModules.isHybridObject(frameOutput)).toBe(true)
    const ranOnThread = deferred()
    frameOutput.thread.runOnThread(() => ranOnThread.resolve())
    await withTimeout(
      ranOnThread.promise,
      5_000,
      'run on the frame output thread',
    )
  })

  // Guard: green before and after. A Suspense boundary keeps passive effects
  // connected while it shows its fallback.
  it('guard: keeps the same useFrameOutput output while <Suspense> shows its fallback', async () => {
    const onFrameOutput = fn<(frameOutput: CameraFrameOutput) => void>()
    const onResumed = fn<() => void>()
    const onError = fn<(error: Error, errorInfo: ErrorInfo) => void>()

    function TestFrameOutput(): null {
      const frameOutput = useFrameOutput({
        onFrame(frame) {
          'worklet'
          frame.dispose()
        },
      })
      useEffect(() => {
        onFrameOutput(frameOutput)
      }, [frameOutput])
      return null
    }

    function Suspender({ pending }: { pending: Promise<void> }): null {
      use(pending)
      onResumed()
      return null
    }

    const renderTree = (pending?: Promise<void>) => (
      <RecordingErrorBoundary onError={onError}>
        <Suspense fallback={null}>
          <TestFrameOutput />
          {pending != null && <Suspender pending={pending} />}
        </Suspense>
      </RecordingErrorBoundary>
    )

    const { rerender } = await render(renderTree())
    await waitFor(() => {
      expect(onFrameOutput).toHaveBeenCalledTimes(1)
    })
    const mountedOutput = onFrameOutput.mock.lastCall?.[0]
    assert.exists(mountedOutput, 'useFrameOutput did not return an output')

    const pending = deferred()
    await rerender(renderTree(pending.promise))
    pending.resolve()
    await waitFor(() => {
      expect(onResumed).toHaveBeenCalled()
    })

    const distinctOutputs = new Set(
      onFrameOutput.mock.calls.map(([output]) => output),
    )
    expect(distinctOutputs.size).toBe(1)
    expect(onFrameOutput.mock.lastCall?.[0]).toBe(mountedOutput)
    expect(onError).not.toHaveBeenCalled()
  })
})
