import type { Size } from '../common-types/Size'
import type { CameraSession } from '../session/CameraSession.nitro'
import type { PreviewView } from '../views/PreviewView.nitro'
import type { CameraOutput } from './CameraOutput.nitro'

/**
 * Describes the Preview's configured stream in its native orientation.
 */
export interface PreviewConfiguration {
  /** The dimensions of the Preview's input stream in sensor-native (unrotated) pixels. */
  readonly resolution: Size
  /**
   * The clockwise rotation, in degrees, required to display the stream upright.
   *
   * This is always available on Android and requires iOS 17.0 or newer.
   */
  readonly rotationDegrees?: number
}

/**
 * Configuration options for a {@linkcode CameraPreviewOutput}.
 */
export interface PreviewOutputOptions {
  /**
   * The preferred Preview resolution. The {@linkcode CameraSession}
   * negotiates this with its other outputs, so the resulting resolution
   * may differ.
   *
   * When omitted, the platform's default Preview resolution preference is used.
   */
  targetResolution?: Size
  /**
   * Called whenever the Preview's resolution or rotation changes.
   */
  onConfigurationChanged?: (configuration: PreviewConfiguration) => void
}

/**
 * Represents the {@linkcode CameraOutput} for preview.
 *
 * The {@linkcode CameraPreviewOutput} needs to be connected
 * to the {@linkcode CameraSession} as an output, as well
 * as to a {@linkcode PreviewView} as a target.
 *
 * @example
 * Creating a `CameraPreviewOutput` via the Hooks API:
 * ```ts
 * const previewOutput = usePreviewOutput({
 *   onConfigurationChanged(configuration) {
 *     console.log(configuration)
 *   },
 * })
 * ```
 *
 * @example
 * Creating a `CameraPreviewOutput` via the Imperative API:
 * ```ts
 * const previewOutput = VisionCamera.createPreviewOutput({
 *   onConfigurationChanged(configuration) {
 *     console.log(configuration)
 *   },
 * })
 * ```
 */
export interface CameraPreviewOutput extends CameraOutput {
  /**
   * The Preview's latest known configuration, or `undefined` until its input
   * stream dimensions are available.
   */
  readonly currentConfiguration?: PreviewConfiguration
}
