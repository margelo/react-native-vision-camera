import { useMemo } from 'react'
import type {
  CameraVideoOutput,
  VideoOutputOptions,
} from '../specs/outputs/CameraVideoOutput.nitro'
import type { Recorder } from '../specs/outputs/Recorder.nitro'
import { CommonResolutions } from '../utils/CommonResolutions'
import { VisionCamera } from '../VisionCamera'
import type { Camera } from '../views/Camera'
import { useMemoizedSize } from './internal/useMemoizedSize'

/**
 * Use a {@linkcode CameraVideoOutput} for recording videos.
 *
 * The returned {@linkcode CameraVideoOutput} can be passed to a
 * {@linkcode Camera} to enable video recording. To actually record a video,
 * create a {@linkcode Recorder} via
 * {@linkcode CameraVideoOutput.createRecorder | createRecorder(...)}, then
 * start and stop it via {@linkcode Recorder.startRecording | startRecording(...)}
 * and {@linkcode Recorder.stopRecording | stopRecording()}.
 *
 * @example
 * ```ts
 * const videoOutput = useVideoOutput({
 *   targetResolution: CommonResolutions.FHD_16_9,
 *   enableAudio: true,
 * })
 *
 * // ...
 * const recorder = await videoOutput.createRecorder({})
 * await recorder.startRecording(
 *   (filePath) => console.log(`Recorded to ${filePath}`),
 *   (error) => console.error(error),
 * )
 * // later...
 * await recorder.stopRecording()
 * ```
 */
export function useVideoOutput({
  targetResolution = CommonResolutions.FHD_16_9,
  targetBitRate,
  enablePersistentRecorder,
  enableAudio,
  fileType,
}: Partial<VideoOutputOptions> = {}): CameraVideoOutput {
  // `targetResolution` is usually an inline object literal - memoize it by value.
  const memoizedTargetResolution = useMemoizedSize(targetResolution)

  const videoOutput = useMemo(
    () =>
      VisionCamera.createVideoOutput({
        targetResolution: memoizedTargetResolution,
        targetBitRate: targetBitRate,
        enablePersistentRecorder: enablePersistentRecorder,
        enableAudio: enableAudio,
        fileType: fileType,
      }),
    [
      enablePersistentRecorder,
      targetBitRate,
      enableAudio,
      memoizedTargetResolution,
      fileType,
    ],
  )

  return videoOutput
}
