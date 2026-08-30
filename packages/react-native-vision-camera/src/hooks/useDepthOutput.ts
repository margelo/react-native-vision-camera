import { useEffect, useMemo, useRef } from 'react'
import type { FrameDroppedReason } from '../specs/common-types/FrameDroppedReason'
import type { Depth } from '../specs/instances/Depth.nitro'
import type {
  CameraDepthFrameOutput,
  DepthFrameOutputOptions,
} from '../specs/outputs/CameraDepthFrameOutput.nitro'
import { VisionCameraWorkletsProxy } from '../third-party/VisionCameraWorkletsProxy'
import { CommonResolutions } from '../utils/CommonResolutions'
import { VisionCamera } from '../VisionCamera'
import { useMemoizedSize } from './internal/useMemoizedSize'

type BaseDepthOptions = Pick<
  DepthFrameOutputOptions,
  | 'targetResolution'
  | 'allowDeferredStart'
  | 'dropFramesWhileBusy'
  | 'enableFiltering'
>

export interface UseDepthOutputProps extends Partial<BaseDepthOptions> {
  /**
   * A callback that will be called for every {@linkcode Depth} Frame
   * the Camera produces.
   *
   * This must be a synchronous function, like a Worklet.
   *
   * The {@linkcode Depth} Frame must be disposed as soon as it
   * is no longer needed to avoid stalling the Camera pipeline.
   * @worklet
   */
  onDepth?: (depth: Depth) => void
  /**
   * A callback that will be called every time the Camera pipeline
   * has to drop a {@linkcode Depth} Frame.
   *
   * @see {@linkcode FrameDroppedReason}
   */
  onDepthFrameDropped?: (reason: FrameDroppedReason) => void
}

/**
 * Use a {@linkcode CameraDepthFrameOutput} for streaming {@linkcode Depth} Frames.
 *
 * The {@linkcode UseDepthOutputProps.onDepth | onDepth(...)} callback will be
 * called for every {@linkcode Depth} Frame the Camera produces. It is a
 * synchronous JS function running on the {@linkcode CameraDepthFrameOutput}'s
 * thread - aka a "worklet".
 *
 * @note {@linkcode useDepthOutput | useDepthOutput(...)} requires
 * `react-native-vision-camera-worklets` (and
 * [react-native-worklets](https://docs.swmansion.com/react-native-worklets/docs/))
 * to be installed.
 *
 * @discussion
 * You must {@linkcode Depth.dispose | dispose} the {@linkcode Depth} Frame after
 * your callback has finished processing, otherwise subsequent Frames may be
 * dropped (see {@linkcode UseDepthOutputProps.onDepthFrameDropped | onDepthFrameDropped(...)}).
 *
 * @example
 * ```ts
 * const depthOutput = useDepthOutput({
 *   onDepth(depth) {
 *     'worklet'
 *     // some depth processing
 *     depth.dispose()
 *   }
 * })
 * ```
 */
export function useDepthOutput({
  targetResolution = CommonResolutions.VGA_16_9,
  enableFiltering = true,
  onDepth,
  onDepthFrameDropped,
  dropFramesWhileBusy = true,
  allowDeferredStart = true,
}: UseDepthOutputProps): CameraDepthFrameOutput {
  // 1. `targetResolution` is usually an inline object literal - memoize it by value.
  const memoizedTargetResolution = useMemoizedSize(targetResolution)

  // 2. Create depth output
  const depthOutput = useMemo(
    () =>
      VisionCamera.createDepthFrameOutput({
        targetResolution: memoizedTargetResolution,
        enableFiltering: enableFiltering,
        enablePhysicalBufferRotation: false,
        dropFramesWhileBusy: dropFramesWhileBusy,
        allowDeferredStart: allowDeferredStart,
      }),
    [
      memoizedTargetResolution,
      enableFiltering,
      dropFramesWhileBusy,
      allowDeferredStart,
    ],
  )

  // 3. Add Frame dropped warner
  const onDepthFrameDroppedRef = useRef(onDepthFrameDropped)
  onDepthFrameDroppedRef.current = onDepthFrameDropped
  useEffect(() => {
    depthOutput.setOnDepthFrameDroppedCallback((reason) => {
      const callback = onDepthFrameDroppedRef.current
      if (callback != null) callback(reason)
      else console.warn(`Depth Frame Dropped! Reason: ${reason}`)
    })
  }, [depthOutput])

  // 4. Create Worklet Runtime for NativeThread
  const runtime = useMemo(
    () => VisionCameraWorkletsProxy.createRuntimeForThread(depthOutput.thread),
    [depthOutput.thread],
  )
  // 5. Update onDepth() callback if it changed
  useEffect(() => {
    runtime.setOnDepthFrameCallback(depthOutput, onDepth)
  }, [runtime, depthOutput, onDepth])

  // 6. Return :)
  return depthOutput
}
