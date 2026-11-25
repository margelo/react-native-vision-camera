import type { Size } from '../specs/common-types/Size'
import type { PreviewConfiguration } from '../specs/outputs/CameraPreviewOutput.nitro'

/**
 * Calculates the Preview stream's resolution after applying the rotation
 * required to display it upright.
 *
 * On iOS, this requires iOS 17.0 or newer because earlier versions do not
 * provide the Preview rotation. Android is supported on all versions.
 */
export function getUprightPreviewResolution(
  configuration: PreviewConfiguration | undefined,
): Size | undefined {
  if (configuration?.rotationDegrees == null) return undefined

  const { width, height } = configuration.resolution
  if (width <= 0 || height <= 0) return undefined

  const swapsDimensions =
    configuration.rotationDegrees === 90 ||
    configuration.rotationDegrees === 270

  return swapsDimensions ? { width: height, height: width } : { width, height }
}
