import type { PreviewConfiguration } from '../specs/outputs/CameraPreviewOutput.nitro'
import { getUprightPreviewResolution } from './getUprightPreviewResolution'

/**
 * Calculates the Preview stream's aspect ratio after applying the rotation
 * required to display it upright.
 *
 * On iOS, this requires iOS 17.0 or newer. Android is supported on all
 * versions.
 */
export function getUprightPreviewAspectRatio(
  configuration: PreviewConfiguration | undefined,
): number | undefined {
  const resolution = getUprightPreviewResolution(configuration)
  if (resolution == null) return undefined

  return resolution.width / resolution.height
}
