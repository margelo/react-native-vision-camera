import { useEffect } from 'react'
import { NitroModules } from 'react-native-nitro-modules'
import type { SharedValue } from 'react-native-reanimated'
import { getCameraDevice } from '../devices/getCameraDevice'
import type {
  CameraController,
  CameraControllerConfiguration,
} from '../specs/CameraController.nitro'
import type { CameraOrientation } from '../specs/common-types/CameraOrientation'
import type { TargetCameraPosition } from '../specs/common-types/CameraPosition'
import type { Constraint } from '../specs/common-types/Constraint'
import type { MirrorMode } from '../specs/common-types/MirrorMode'
import type { OrientationSource } from '../specs/common-types/OrientationSource'
import type { TorchMode } from '../specs/common-types/TorchMode'
import type { CameraDevice } from '../specs/inputs/CameraDevice.nitro'
import type { CameraOutput } from '../specs/outputs/CameraOutput.nitro'
import type { CameraVideoOutput } from '../specs/outputs/CameraVideoOutput.nitro'
import type { CameraOutputConfiguration } from '../specs/session/CameraOutputConfiguration'
import type {
  CameraSession,
  InterruptionReason,
} from '../specs/session/CameraSession.nitro'
import type { CameraSessionConfig } from '../specs/session/CameraSessionConfig.nitro'
import type { CameraSessionConfiguration } from '../specs/session/CameraSessionConfiguration'
import type { CameraSessionConnection } from '../specs/session/CameraSessionConnection'
import { getUIRotation } from '../utils/getUIRotation'
import { useCameraController } from './internal/useCameraController'
import { useCameraControllerConfiguration } from './internal/useCameraControllerConfiguration'
import { useCameraSession } from './internal/useCameraSession'
import { useCameraSessionIsRunning } from './internal/useCameraSessionIsRunning'
import { useExposureUpdater } from './internal/useExposureUpdater'
import { useListenerSubscription } from './internal/useListenerSubscription'
import { useStableCallback } from './internal/useStableCallback'
import { useTorchModeUpdater } from './internal/useTorchModeUpdater'
import { useZoomUpdater } from './internal/useZoomUpdater'
import { useOrientation } from './useOrientation'

export interface CameraProps
  extends CameraSessionConfiguration,
    CameraControllerConfiguration {
  // Session Configuration
  /**
   * Starts the {@linkcode CameraSession} when set to `true`, and stops it
   * when set back to `false`.
   *
   * @see {@linkcode CameraSession.start | CameraSession.start()}
   * @see {@linkcode CameraSession.stop | CameraSession.stop()}
   * @see {@linkcode CameraSession.isRunning}
   */
  isActive: boolean

  // Connection Configuration
  /**
   * The {@linkcode CameraDevice} to open, or a {@linkcode TargetCameraPosition}
   * (e.g. `'back'`) to auto-pick a matching device via
   * {@linkcode getCameraDevice | getCameraDevice(...)}.
   *
   * @see {@linkcode CameraSessionConnection.input}
   */
  device: CameraDevice | TargetCameraPosition
  /**
   * The {@linkcode CameraOutput}s the {@linkcode device} will stream into.
   *
   * @see {@linkcode CameraSessionConnection.outputs}
   * @see {@linkcode CameraOutputConfiguration.output}
   */
  outputs?: CameraOutput[]
  /**
   * {@linkcode Constraint}s (e.g. `{ fps: 60 }`) that the Camera pipeline
   * will try to match when configuring the {@linkcode CameraSession}.
   *
   * @see {@linkcode CameraSessionConnection.constraints}
   */
  constraints?: Constraint[]
  /**
   * Called once the given {@linkcode constraints} have been fully resolved
   * into a concrete {@linkcode CameraSessionConfig}.
   *
   * @see {@linkcode CameraSessionConnection.onSessionConfigSelected}
   */
  onSessionConfigSelected?: (config: CameraSessionConfig) => void
  /**
   * Set a desired {@linkcode OrientationSource}
   * for automatically applying {@linkcode CameraOrientation}
   * to all {@linkcode outputs}, or `'custom'` if you
   * prefer to manually specify {@linkcode CameraOrientation}
   * yourself.
   *
   * @see {@linkcode CameraOutput.outputOrientation}
   */
  orientationSource?: OrientationSource | 'custom'
  /**
   * Called when the Camera Output orientation (driven
   * by {@linkcode orientationSource}) or the interface
   * orientation changes with a {@linkcode rotation} value
   * that specifies the degrees needed to rotate UI elements
   * such as Camera controls (flash button, Camera flip button)
   * so they appear upright.
   * @param rotation The degrees that UI elements need to be rotated by to appear up-right.
   */
  onUIRotationChanged?: (rotation: number) => void
  /**
   * Sets whether the {@linkcode CameraOutput}s are mirrored along
   * the vertical axis. {@linkcode MirrorMode | 'auto'} mirrors
   * automatically on selfie cameras.
   *
   * @see {@linkcode CameraOutputConfiguration.mirrorMode}
   * @default 'auto'
   */
  mirrorMode?: MirrorMode

  // Declarative props
  /**
   * Sets the {@linkcode CameraController.zoom | zoom} value declaratively.
   *
   * You can also imperatively set zoom via
   * {@linkcode CameraController.setZoom | setZoom(...)}.
   *
   * @note This property can be animated via Reanimated by passing a {@linkcode SharedValue}.
   * @default 1
   */
  zoom?: number | SharedValue<number>
  /**
   * Sets the {@linkcode CameraController.exposureBias | exposureBias} value
   * declaratively.
   *
   * You can also imperatively set the exposure bias via
   * {@linkcode CameraController.setExposureBias | setExposureBias(...)}.
   *
   * @note This property can be animated via Reanimated by passing a {@linkcode SharedValue}.
   * @default 0
   */
  exposure?: number | SharedValue<number>
  /**
   * Sets the {@linkcode CameraController.torchMode | torchMode} value
   * declaratively.
   * @default 'off'
   */
  torchMode?: TorchMode

  // Initial Props for Controller
  /**
   * A getter for the initial zoom value to apply when the
   * {@linkcode CameraController} is created. Later, the zoom can be
   * adjusted via {@linkcode CameraController.setZoom | CameraController.setZoom(...)}.
   *
   * @see {@linkcode CameraSessionConnection.initialZoom}
   */
  getInitialZoom?: () => number | undefined
  /**
   * A getter for the initial exposure bias to apply when the
   * {@linkcode CameraController} is created. Later, the exposure bias can be
   * adjusted via {@linkcode CameraController.setExposureBias | CameraController.setExposureBias(...)}.
   *
   * @see {@linkcode CameraSessionConnection.initialExposureBias}
   */
  getInitialExposureBias?: () => number | undefined

  // Callbacks
  /**
   * Called whenever the {@linkcode CameraSession}
   * has been configured with new connections via
   * {@linkcode CameraSession.configure | configure(...)}
   * and connections to the individual outputs are formed.
   *
   * This is a good place to check output
   * capabilities, such as {@linkcode CameraVideoOutput.getSupportedVideoCodecs | CameraVideoOutput.getSupportedVideoCodecs()}
   */
  onConfigured?: () => void
  /**
   * Called when the {@linkcode CameraSession}
   * has been started.
   *
   * @see {@linkcode CameraSession.addOnStartedListener}
   */
  onStarted?: () => void
  /**
   * Called when the {@linkcode CameraSession}
   * has been stopped.
   *
   * @see {@linkcode CameraSession.addOnStoppedListener}
   */
  onStopped?: () => void
  /**
   * Called whenever the {@linkcode CameraSession}
   * has encountered an error.
   *
   * @see {@linkcode CameraSession.addOnErrorListener}
   */
  onError?: (error: Error) => void
  /**
   * Called whenever the {@linkcode CameraSession}
   * has encountered an interruption of the given
   * {@linkcode InterruptionReason}.
   * Interruptions are temporarily.
   *
   * @see {@linkcode CameraSession.addOnInterruptionStartedListener}
   */
  onInterruptionStarted?: (interruption: InterruptionReason) => void
  /**
   * Called when a previous interruption
   * has ended and the {@linkcode CameraSession}
   * is running uninterrupted again.
   *
   * @see {@linkcode CameraSession.addOnInterruptionEndedListener}
   */
  onInterruptionEnded?: () => void
  /**
   * Called when the subject area substantially changes,
   * e.g. when the user pans away from a scene that was
   * previously in focus.
   *
   * This is a good point to reset any locked AE/AF/AWB
   * focus states back to continuously auto-focus.
   *
   * @see {@linkcode CameraController.addSubjectAreaChangedListener}
   * @platform iOS
   */
  onSubjectAreaChanged?: () => void
}

function defaultOnErrorHandler(error: Error) {
  console.error(error)
}

function getAnimatableNumberInitialValue(
  value: number | SharedValue<number> | undefined,
): number | undefined {
  if (value == null) return undefined
  else if (typeof value === 'number') return value
  else return value.get()
}

/**
 * Use the Camera.
 *
 * This creates a {@linkcode CameraSession}, manages
 * the input and outputs (including orientation and
 * mirror modes), wraps listeners as stable React
 * callbacks, and returns a {@linkcode CameraController}.
 *
 * @example
 * ```ts
 * const camera = useCamera({
 *   isActive: true,
 *   device: 'back',
 *   outputs: []
 * })
 * ```
 */
export function useCamera({
  isActive,
  device,
  outputs = [],
  constraints,
  onSessionConfigSelected,
  mirrorMode,
  onConfigured,
  allowBackgroundAudioPlayback,
  allowHapticsAndSystemSoundsPlayback,
  orientationSource = 'device',
  onStarted,
  onStopped,
  onError = defaultOnErrorHandler,
  onInterruptionStarted,
  onInterruptionEnded,
  onSubjectAreaChanged,
  onUIRotationChanged,
  enableDistortionCorrection,
  enableLowLightBoost,
  enableSmoothAutoFocus,
  zoom,
  exposure,
  torchMode,
}: CameraProps): CameraController | undefined {
  // 1. Create session
  const session = useCameraSession({
    enableMultiCamSupport: false,
    onError: onError,
  })

  // TODO: Refactor our orientation logic here because it is problematic for multiple reasons;
  //       1. Avoid going through re-renders/React state to change orientation (2x useOrientation(..)) (slow)
  //       2. Avoid going through multiple setter calls here in a useEffect to set output orientation (possible race condition)
  //       3. Avoid having a static useOrientation(...) hook - instead, have a UI element (`<NativePreviewView />`) fire interface orientation listeners (multi-display support)
  //       4. orientationSource="custom" currently resorts back to 'up', which is not true - not sure if we just skip the callback or ignore instead?
  //       Instead, have orientation source be native/declarative so we can use `AVCaptureDevice.RotationCoordinator` and drive orientation from a preview without re-renders.
  // 2. Update output orientations
  const orientationSourceOrUndefined =
    orientationSource === 'custom' ? undefined : orientationSource
  const orientation = useOrientation(orientationSourceOrUndefined)
  useEffect(() => {
    if (orientation == null) return
    for (const output of outputs) {
      // A disposed output has no native object. Its setter would crash in release builds.
      if (!NitroModules.isHybridObject(output)) continue
      output.outputOrientation = orientation
    }
  }, [orientation, outputs])

  // 2.1. Call onUIRotationChanged listener
  const interfaceOrientation = useOrientation(
    onUIRotationChanged != null ? 'interface' : undefined,
  )
  const uiRotation = getUIRotation(
    orientation ?? 'up',
    interfaceOrientation ?? 'up',
  )
  const stableOnUIRotationChanged = useStableCallback(onUIRotationChanged)
  useEffect(() => {
    if (stableOnUIRotationChanged == null) return
    stableOnUIRotationChanged(uiRotation)
  }, [stableOnUIRotationChanged, uiRotation])

  // 4. Configure the session with the input + outputs to create a `CameraController`
  const controller = useCameraController(session, device, outputs, {
    mirrorMode: mirrorMode,
    onConfigured: onConfigured,
    getInitialExposureBias: () => getAnimatableNumberInitialValue(exposure),
    getInitialZoom: () => getAnimatableNumberInitialValue(zoom),
    constraints: constraints,
    onSessionConfigSelected: onSessionConfigSelected,
    allowBackgroundAudioPlayback: allowBackgroundAudioPlayback,
    allowHapticsAndSystemSoundsPlayback: allowHapticsAndSystemSoundsPlayback,
    onError: onError,
  })

  // 5. Configure the Controller with some settings
  useCameraControllerConfiguration(
    controller,
    {
      enableSmoothAutoFocus: enableSmoothAutoFocus,
      enableDistortionCorrection: enableDistortionCorrection,
      enableLowLightBoost: enableLowLightBoost,
    },
    onError,
  )

  // 6. Start (or stop) the Session if we have a Controller and `isActive` is true.
  const hasController = controller != null
  useCameraSessionIsRunning(session, isActive && hasController, onError)

  // 7. Set up listeners and delegate to JS
  useListenerSubscription(session, 'addOnStartedListener', onStarted)
  useListenerSubscription(session, 'addOnStoppedListener', onStopped)
  useListenerSubscription(session, 'addOnErrorListener', onError)
  useListenerSubscription(
    session,
    'addOnInterruptionStartedListener',
    onInterruptionStarted,
  )
  useListenerSubscription(
    session,
    'addOnInterruptionEndedListener',
    onInterruptionEnded,
  )
  useListenerSubscription(
    controller,
    'addSubjectAreaChangedListener',
    onSubjectAreaChanged,
  )

  // 8. Update CameraController props
  useZoomUpdater(controller, zoom, onError)
  useExposureUpdater(controller, exposure, onError)
  useTorchModeUpdater(controller, torchMode, onError)

  // 9. Give the user the controller
  return controller
}
