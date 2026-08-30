import { useMemo } from 'react'
import type { Photo } from '../specs/instances/Photo.nitro'
import type {
  CameraPhotoOutput,
  PhotoOutputOptions,
} from '../specs/outputs/CameraPhotoOutput.nitro'
import { CommonResolutions } from '../utils/CommonResolutions'
import { VisionCamera } from '../VisionCamera'
import type { Camera } from '../views/Camera'
import { useMemoizedSize } from './internal/useMemoizedSize'

/**
 * Use a {@linkcode CameraPhotoOutput} for capturing {@linkcode Photo}s.
 *
 * The returned {@linkcode CameraPhotoOutput} can be passed to a
 * {@linkcode Camera} to enable photo capture. Photos can then be captured
 * via {@linkcode CameraPhotoOutput.capturePhoto | capturePhoto(...)}.
 *
 * @example
 * ```ts
 * const photoOutput = usePhotoOutput({
 *   targetResolution: CommonResolutions.UHD_4_3,
 *   qualityPrioritization: 'quality',
 * })
 *
 * // ...
 * const photo = await photoOutput.capturePhoto({ flashMode: 'on' }, {})
 * // ...
 * photo.dispose()
 * ```
 */
export function usePhotoOutput({
  targetResolution = CommonResolutions.UHD_4_3,
  containerFormat = 'native',
  quality = 0.9,
  qualityPrioritization = 'balanced',
  previewImageTargetSize = undefined,
}: Partial<PhotoOutputOptions> = {}): CameraPhotoOutput {
  // 1. `Size`s are usually inline object literals - memoize them by value.
  const memoizedTargetResolution = useMemoizedSize(targetResolution)
  const memoizedPreviewImageTargetSize = useMemoizedSize(previewImageTargetSize)

  // 2. Create photo output
  const photoOutput = useMemo(
    () =>
      VisionCamera.createPhotoOutput({
        targetResolution: memoizedTargetResolution,
        containerFormat: containerFormat,
        quality: quality,
        qualityPrioritization: qualityPrioritization,
        previewImageTargetSize: memoizedPreviewImageTargetSize,
      }),
    [
      memoizedTargetResolution,
      containerFormat,
      quality,
      qualityPrioritization,
      memoizedPreviewImageTargetSize,
    ],
  )

  return photoOutput
}
