import type { HybridObject } from 'react-native-nitro-modules'
import type { Constraint } from './common-types/Constraint'
import type { OrientationSource } from './common-types/OrientationSource'
import type { PermissionStatus } from './common-types/PermissionStatus'
import type { FrameRenderer } from './FrameRenderer.nitro'
import type { TapToFocusGestureController } from './gestures/TapToFocusGestureController.nitro'
import type { ZoomGestureController } from './gestures/ZoomGestureController.nitro'
import type { CameraDevice } from './inputs/CameraDevice.nitro'
import type { CameraDeviceFactory } from './inputs/CameraDeviceFactory.nitro'
import type { MeteringPoint } from './metering/MeteringPoint.nitro'
import type { OrientationManager } from './orientation/OrientationManager.nitro'
import type {
  CameraDepthFrameOutput,
  DepthFrameOutputOptions,
} from './outputs/CameraDepthFrameOutput.nitro'
import type {
  CameraFrameOutput,
  FrameOutputOptions,
} from './outputs/CameraFrameOutput.nitro'
import type {
  CameraObjectOutput,
  ObjectOutputOptions,
} from './outputs/CameraObjectOutput.nitro'
import type { CameraOutput } from './outputs/CameraOutput.nitro'
import type { CameraOutputSynchronizer } from './outputs/CameraOutputSynchronizer.nitro'
import type {
  CameraPhotoOutput,
  PhotoOutputOptions,
} from './outputs/CameraPhotoOutput.nitro'
import type {
  CameraPreviewOutput,
  PreviewOutputOptions,
} from './outputs/CameraPreviewOutput.nitro'
import type {
  CameraVideoOutput,
  VideoOutputOptions,
} from './outputs/CameraVideoOutput.nitro'
import type { CameraOutputConfiguration } from './session/CameraOutputConfiguration'
import type { CameraSession } from './session/CameraSession.nitro'
import type { CameraSessionConfig } from './session/CameraSessionConfig.nitro'

/**
 * The {@linkcode CameraFactory} allows creating various other
 * Camera related objects with arguments.
 */
export interface CameraFactory
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /**
   * Get the current Camera {@linkcode PermissionStatus}.
   */
  readonly cameraPermissionStatus: PermissionStatus
  /**
   * Get the current Microphone {@linkcode PermissionStatus}.
   */
  readonly microphonePermissionStatus: PermissionStatus
  /**
   * Request Camera permission.
   * @returns `true` if Camera permission has now been granted, `false` otherwise.
   */
  requestCameraPermission(): Promise<boolean>
  /**
   * Request Microphone permission.
   * @returns `true` if Microphone permission has now been granted, `false` otherwise.
   */
  requestMicrophonePermission(): Promise<boolean>

  /**
   * Gets whether the platform supports creating multi-cam
   * {@linkcode CameraSession}s.
   *
   * Older phones may not be able to support this.
   * @see {@linkcode createCameraSession | createCameraSession(enableMultiCam)}
   */
  readonly supportsMultiCamSessions: boolean

  // Session
  /**
   * Creates a new {@linkcode CameraSession}.
   *
   * - If {@linkcode enableMultiCam} is `true`, the {@linkcode CameraSession}
   * supports attaching multiple {@linkcode CameraDevice}s as inputs/connections
   * at the same time.
   * - If {@linkcode enableMultiCam} is `false`, the {@linkcode CameraSession}
   * only supports a single {@linkcode CameraDevice} input at a time.
   *
   * @throws If {@linkcode enableMultiCam} is `true`, but {@linkcode supportsMultiCamSessions} is `false`.
   */
  createCameraSession(enableMultiCam: boolean): Promise<CameraSession>

  /**
   * Resolves the given {@linkcode constraints} to a fully validated
   * {@linkcode CameraSessionConfig} respecting the given {@linkcode device}'s
   * capabilities negotiated with the given {@linkcode outputConfigurations}.
   *
   * The given {@linkcode constraints} are ranked by priority in their
   * order passed in the array, descending.
   * The first item (index `0`) has highest priority, while the last item
   * has lowest priority.
   *
   * @discussion
   * On a device that supports every possible combination of features,
   * the returned {@linkcode CameraSessionConfig} features exactly what was
   * described in the given {@linkcode constraints}.
   * Most devices however negotiate available features across the given
   * {@linkcode outputConfigurations} because of bandwidth constraints or
   * simply feature compatibility - for example, 10-bit Video HDR is often
   * not supported when used in conjunction with 100+ FPS.
   * Also, maximum available video resolution is often only available when
   * using a lower photo resolution, and vice-versa.
   *
   * @discussion
   * The `resolutionPreference` {@linkcode Constraint} is optional, but
   * may rank the given {@linkcode CameraOutput}'s resolution above other
   * {@linkcode Constraint}s.
   * If a `resolutionPreference` {@linkcode Constraint} is omitted, it is
   * treated as last priority - other {@linkcode Constraint}s shall be met
   * first, if possible.
   *
   * @example
   * For a Photo HDR session configuration, use this:
   * ```ts
   * const device = ...
   * const photoOutput = ...
   * const config = await resolveConstraints(
   *   device,
   *   [photoOutput],
   *   [
   *     { resolutionPreference: photoOutput },
   *     { photoHDR: true },
   *   ]
   * )
   * ```
   * @example
   * To also enable Video HDR (if available), but still prefer Photo HDR if both are not
   * supported concurrently, use this:
   * ```ts
   * const device = ...
   * const photoOutput = ...
   * const videoOutput = ...
   * const config = await resolveConstraints(
   *   device,
   *   [photoOutput, videoOutput],
   *   [
   *     { resolutionPreference: photoOutput },
   *     { resolutionPreference: videoOutput },
   *     { photoHDR: true },
   *     { videoDynamicRange: CommonDynamicRanges.ANY_HDR },
   *   ]
   * )
   * ```
   */
  resolveConstraints(
    device: CameraDevice,
    outputConfigurations: CameraOutputConfiguration[],
    constraints: Constraint[],
    requiresMultiCam?: boolean,
  ): Promise<CameraSessionConfig>
  // Inputs
  /**
   * Asynchronously create a new {@linkcode CameraDeviceFactory}.
   */
  createDeviceFactory(): Promise<CameraDeviceFactory>
  // Outputs
  /**
   * Create a new {@linkcode CameraPhotoOutput}
   * with the given {@linkcode PhotoOutputOptions}.
   */
  createPhotoOutput(options: PhotoOutputOptions): CameraPhotoOutput
  /**
   * Create a new {@linkcode CameraVideoOutput}
   * with the given {@linkcode VideoOutputOptions}.
   */
  createVideoOutput(options: VideoOutputOptions): CameraVideoOutput
  /**
   * Create a new {@linkcode CameraFrameOutput}
   * with the given {@linkcode FrameOutputOptions}.
   */
  createFrameOutput(options: FrameOutputOptions): CameraFrameOutput
  /**
   * Create a new {@linkcode CameraDepthFrameOutput}
   * with the given {@linkcode DepthFrameOutputOptions}.
   */
  createDepthFrameOutput(
    options: DepthFrameOutputOptions,
  ): CameraDepthFrameOutput
  /**
   * Create a new {@linkcode CameraPreviewOutput}.
   */
  createPreviewOutput(options: PreviewOutputOptions): CameraPreviewOutput
  /**
   * Create a new {@linkcode CameraObjectOutput}
   * with the given {@linkcode ObjectOutputOptions}.
   * @platform iOS
   */
  createObjectOutput(options: ObjectOutputOptions): CameraObjectOutput
  /**
   * Create a new {@linkcode CameraOutputSynchronizer} that
   * synchronizes the given {@linkcode outputs}.
   * @platform iOS
   */
  createOutputSynchronizer(outputs: CameraOutput[]): CameraOutputSynchronizer

  // Utils
  /**
   * Creates a new {@linkcode ZoomGestureController}.
   */
  createZoomGestureController(): ZoomGestureController
  /**
   * Creates a new {@linkcode TapToFocusGestureController}.
   */
  createTapToFocusGestureController(): TapToFocusGestureController
  /**
   * Creates a new {@linkcode OrientationManager}.
   */
  createOrientationManager(
    orientationSource: OrientationSource,
  ): OrientationManager
  /**
   * Create a new {@linkcode FrameRenderer}.
   */
  createFrameRenderer(): FrameRenderer
  /**
   * Creates a normalized {@linkcode MeteringPoint}, where `x` and `y` are
   * values in the normalized range from 0.0 to 1.0.
   *
   * Your are responsible for handling orientation, cropping and scaling.
   * @param x The X coordinate ranging from 0.0 to 1.0
   * @param y The Y coordinate ranging from 0.0 to 1.0
   * @param size The size/radius of the {@linkcode MeteringPoint}
   */
  createNormalizedMeteringPoint(
    x: number,
    y: number,
    size?: number,
  ): MeteringPoint
}
