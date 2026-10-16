import type { HybridObject } from 'react-native-nitro-modules'
import type { AutoFocusSystem } from '../common-types/AutoFocusSystem'
import type {
  DynamicRange,
  TargetDynamicRange,
} from '../common-types/DynamicRange'
import type { PixelFormat } from '../common-types/PixelFormat'
import type { Size } from '../common-types/Size'
import type { TargetStabilizationMode } from '../common-types/StabilizationMode'
import type { CameraDevice } from '../inputs/CameraDevice.nitro'
import type { Frame } from '../instances/Frame.nitro'
import type { CameraFrameOutput } from '../outputs/CameraFrameOutput.nitro'
import type { CameraPreviewOutput } from '../outputs/CameraPreviewOutput.nitro'
import type { CameraVideoOutput } from '../outputs/CameraVideoOutput.nitro'
import type { CameraSession } from './CameraSession.nitro'

// TODO: Is there anything else we should expose here?
// TODO: Split this into a flat interface (which can be created by the user to probe for a session config) and a ResolvedSessionConfig HybridObject that contains the state.

/**
 * Session-level configuration for a {@linkcode CameraSession}.
 *
 * You can check if a specific {@linkcode CameraSessionConfig} is
 * supported via {@linkcode CameraDevice.isSessionConfigSupported | CameraDevice.isSessionConfigSupported(...)}.
 */
export interface CameraSessionConfig
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /**
   * Gets the currently selected FPS, or `undefined` if no specific
   * FPS value has been selected.
   */
  readonly selectedFPS?: number

  /**
   * Gets the native video dimensions selected by the constraint resolver, or
   * `undefined` when the platform cannot report them before the session starts.
   *
   * Unlike an output's `currentResolution`, this value describes the resolved
   * session configuration and is therefore safe to read from
   * `onSessionConfigSelected` before capture begins.
   */
  readonly selectedVideoResolution?: Size

  /**
   * Gets the currently selected {@linkcode TargetStabilizationMode}
   * for Video Streams (e.g. {@linkcode CameraVideoOutput}), or
   * `undefined` if no specific stabilization mode has been configured.
   */
  readonly selectedVideoStabilizationMode?: TargetStabilizationMode

  /**
   * Gets the currently selected {@linkcode TargetStabilizationMode}
   * for Preview Streams (e.g. {@linkcode CameraPreviewOutput}), or
   * `undefined` if no specific stabilization mode has been configured.
   */
  readonly selectedPreviewStabilizationMode?: TargetStabilizationMode

  /**
   * Gets the currently selected {@linkcode DynamicRange}
   * for Video Streams (e.g. {@linkcode CameraVideoOutput}), or
   * `undefined` if no specific dynamic range has been configured.
   */
  readonly selectedVideoDynamicRange?: TargetDynamicRange

  /**
   * Gets whether Photo HDR is enabled, or not.
   */
  readonly isPhotoHDREnabled: boolean

  /**
   * Gets the {@linkcode PixelFormat} this config is natively
   * streaming in.
   *
   * @discussion
   * If {@linkcode nativePixelFormat} is the same {@linkcode PixelFormat}
   * as the requested pixel format of your streaming output (e.g.
   * a {@linkcode CameraFrameOutput}), no conversion has to take place
   * to stream {@linkcode Frame}s, which provides better performance and
   * lower latency.
   *
   * If these pixel formats differ, pixel format conversions take place
   * causing higher latency which ultimately causes lower throughput
   * and higher battery usage.
   */
  readonly nativePixelFormat: PixelFormat

  /**
   * Get the {@linkcode AutoFocusSystem} used by this {@linkcode CameraSessionConfig}.
   */
  readonly autoFocusSystem: AutoFocusSystem

  /**
   * Gets whether this {@linkcode CameraSessionConfig} is streaming in a
   * binned format.
   *
   * @discussion
   * Pixel binning combines multiple neighboring sensor pixels into one larger effective pixel.
   * This usually improves low-light sensitivity and reduces noise, but can trade away fine detail
   * compared to a full-resolution non-binned readout.
   * Additionally, binned formats are more performant as they use significantly less bandwidth.
   */
  readonly isBinned: boolean
}
