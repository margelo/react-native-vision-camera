import { useMemo } from 'react'
import type {
  CameraPreviewOutput,
  PreviewConfiguration,
  PreviewOutputOptions,
} from '../specs/outputs/CameraPreviewOutput.nitro'
import type { CameraSession } from '../specs/session/CameraSession.nitro'
import { VisionCamera } from '../VisionCamera'
import { useMemoizedSize } from './internal/useMemoizedSize'
import { useStableCallback } from './internal/useStableCallback'

export interface UsePreviewOutputProps extends PreviewOutputOptions {
  /**
   * A callback that is called whenever the Preview's resolution or rotation changes.
   */
  onConfigurationChanged?: (configuration: PreviewConfiguration) => void
}

/**
 * Use a {@linkcode CameraPreviewOutput} for rendering the Camera's live
 * preview on screen.
 *
 * The returned {@linkcode CameraPreviewOutput} can be connected to a
 * {@linkcode CameraSession} and then displayed using the `PreviewView`.
 *
 * @example
 * ```ts
 * const previewOutput = usePreviewOutput({
 *   onConfigurationChanged(configuration) {
 *     console.log(configuration)
 *   },
 * })
 * ```
 */
export function usePreviewOutput({
  targetResolution,
  onConfigurationChanged,
}: UsePreviewOutputProps = {}): CameraPreviewOutput {
  const stableOnConfigurationChanged = useStableCallback(
    onConfigurationChanged ?? (() => {}),
  )

  const memoizedTargetResolution = useMemoizedSize(targetResolution)

  return useMemo(
    () =>
      VisionCamera.createPreviewOutput({
        targetResolution: memoizedTargetResolution,
        onConfigurationChanged: stableOnConfigurationChanged,
      }),
    [memoizedTargetResolution, stableOnConfigurationChanged],
  )
}
