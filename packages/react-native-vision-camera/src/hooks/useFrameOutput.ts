import { useEffect, useMemo, useRef } from 'react'
import type { PixelFormatConstraint } from '../specs/common-types/Constraint'
import type { FrameDroppedReason } from '../specs/common-types/FrameDroppedReason'
import type { PixelFormat } from '../specs/common-types/PixelFormat'
import type {
  TargetVideoPixelFormat,
  VideoPixelFormat,
} from '../specs/common-types/VideoPixelFormat'
import type { Frame } from '../specs/instances/Frame.nitro'
import type {
  CameraFrameOutput,
  FrameOutputOptions,
} from '../specs/outputs/CameraFrameOutput.nitro'
import { VisionCameraWorkletsProxy } from '../third-party/VisionCameraWorkletsProxy'
import { CommonResolutions } from '../utils/CommonResolutions'
import { VisionCamera } from '../VisionCamera'
import { useMemoizedSize } from './internal/useMemoizedSize'

export interface UseFrameOutputProps extends Partial<FrameOutputOptions> {
  /**
   * A callback that will be called for every {@linkcode Frame}
   * the Camera sees.
   *
   * This must be a synchronous function, like a Worklet.
   *
   * The {@linkcode Frame} must be disposed as soon as it
   * is no longer needed to avoid stalling the Camera pipeline.
   * @worklet
   * @example
   * ```ts
   * const frameOutput = useFrameOutput({
   *   onFrame(frame) {
   *     'worklet'
   *     // some frame processing
   *     frame.dispose()
   *   }
   * })
   * ```
   */
  onFrame?: (frame: Frame) => void
  /**
   * A callback that will be called for every time the
   * Camera pipeline has to drop a {@linkcode Frame}.
   *
   * If {@linkcode FrameDroppedReason} is {@linkcode FrameDroppedReason | 'out-of-buffers'},
   * a {@linkcode Frame} was dropped because the
   * {@linkcode onFrame | onFrame(...)} callback has been
   * running longer than one frame interval.
   *
   * If your Frame Processor drops a lot of Frames you should
   * speed it up - for example;
   * - Lower your resolution (see {@linkcode FrameOutputOptions.targetResolution})
   * - Optimize the Frame Processor (e.g. run on the GPU/NPU)
   * - Choose a more efficient {@linkcode VideoPixelFormat} (see {@linkcode PixelFormatConstraint})
   */
  onFrameDropped?: (reason: FrameDroppedReason) => void
}

/**
 * Use a {@linkcode CameraFrameOutput}.
 *
 * The {@linkcode UseFrameOutputProps.onFrame | onFrame(...)} callback
 * will be called for every {@linkcode Frame} the Camera
 * sees. It is a synchronous JS function running on the
 * {@linkcode CameraFrameOutput}'s {@linkcode CameraFrameOutput.thread | thread} -
 * aka a "worklet".
 *
 * @note {@linkcode useFrameOutput | useFrameOutput(...)} requires
 * `react-native-vision-camera-worklets` (and
 * [react-native-worklets](https://docs.swmansion.com/react-native-worklets/docs/))
 * to be installed.
 *
 * @discussion
 * You must {@linkcode Frame.dispose | dispose} the {@linkcode Frame} after your
 * Frame Processor has finished processing, otherwise subsequent {@linkcode Frame}s
 * may be dropped (see {@linkcode UseFrameOutputProps.onFrameDropped | onFrameDropped(...)}).
 *
 * @discussion
 * Choosing an appropriate {@linkcode FrameOutputOptions.pixelFormat | pixelFormat}
 * depends on your Frame Processor's usage. While the most commonly used
 * format in visual recognition models is {@linkcode VideoPixelFormat | 'rgb'},
 * it is by far not the most efficient format for a Camera pipeline as it
 * requires an additional conversion and uses ~2.6x more bandwidth than
 * {@linkcode VideoPixelFormat | 'yuv'}.
 *
 * If you render to native Surfaces (e.g. via GPU pipelines or Media Encoders),
 * you may also be able to use {@linkcode TargetVideoPixelFormat | 'native'},
 * which chooses whatever the resolved {@linkcode CameraSessionConfig}'s
 * {@linkcode CameraSessionConfig.nativePixelFormat | nativePixelFormat} is, and
 * requires zero conversions.
 * Use {@linkcode TargetVideoPixelFormat | 'native'} with caution, as the
 * negotiated {@linkcode CameraSessionConfig.nativePixelFormat | nativePixelFormat}
 * might also be a RAW format like {@linkcode VideoPixelFormat | 'raw-bayer-packed96-12-bit'},
 * or a vendor-specific private format ({@linkcode PixelFormat | 'private'}).
 *
 * Examples:
 * - [MLKit](https://developers.google.com/ml-kit) natively supports YUV,
 * so streaming in {@linkcode TargetVideoPixelFormat | 'yuv'} is most efficient.
 * - [OpenCV](https://opencv.org) natively supports YUV, so streaming in
 * {@linkcode TargetVideoPixelFormat | 'yuv'} is most efficient.
 * - [LiteRT](https://ai.google.dev/edge/litert/overview) supports YUV, **but
 * converts to RGB internally** - so streaming in {@linkcode TargetVideoPixelFormat | 'rgb'}
 * directly is more efficient as conversion is handled in the Camera pipeline.
 * - [react-native-skia](https://shopify.github.io/react-native-skia/) supports
 * both YUV and RGB, so streaming in {@linkcode TargetVideoPixelFormat | 'yuv'}
 * is more efficient.
 *
 * @see {@linkcode TargetVideoPixelFormat}
 * @see {@linkcode VideoPixelFormat}
 *
 * @example
 * ```ts
 * const frameOutput = useFrameOutput({
 *   onFrame(frame) {
 *     'worklet'
 *     // some frame processing
 *     frame.dispose()
 *   }
 * })
 * ```
 */
export function useFrameOutput({
  targetResolution = CommonResolutions.HD_16_9,
  pixelFormat = 'native',
  dropFramesWhileBusy = true,
  enableCameraMatrixDelivery = false,
  enablePhysicalBufferRotation = false,
  enablePreviewSizedOutputBuffers = false,
  allowDeferredStart = true,
  onFrame,
  onFrameDropped,
}: UseFrameOutputProps): CameraFrameOutput {
  // 1. `targetResolution` is usually an inline object literal - memoize it by value.
  const memoizedTargetResolution = useMemoizedSize(targetResolution)

  // 2. Create frame output
  const frameOutput = useMemo(
    () =>
      VisionCamera.createFrameOutput({
        targetResolution: memoizedTargetResolution,
        pixelFormat: pixelFormat,
        enablePhysicalBufferRotation: enablePhysicalBufferRotation,
        enableCameraMatrixDelivery: enableCameraMatrixDelivery,
        enablePreviewSizedOutputBuffers: enablePreviewSizedOutputBuffers,
        allowDeferredStart: allowDeferredStart,
        dropFramesWhileBusy: dropFramesWhileBusy,
      }),
    [
      memoizedTargetResolution,
      pixelFormat,
      dropFramesWhileBusy,
      enableCameraMatrixDelivery,
      enablePhysicalBufferRotation,
      enablePreviewSizedOutputBuffers,
      allowDeferredStart,
    ],
  )

  // 3. Add Frame dropped warner
  const onFrameDroppedRef = useRef(onFrameDropped)
  onFrameDroppedRef.current = onFrameDropped
  useEffect(() => {
    frameOutput.setOnFrameDroppedCallback((reason) => {
      const callback = onFrameDroppedRef.current
      if (callback != null) callback(reason)
      else console.warn(`Frame Dropped! Reason: ${reason}`)
    })
  }, [frameOutput])

  // 4. Create Worklet Runtime for NativeThread
  const runtime = useMemo(
    () => VisionCameraWorkletsProxy.createRuntimeForThread(frameOutput.thread),
    [frameOutput.thread],
  )
  // 5. Update onFrame() callback if it changed
  useEffect(() => {
    runtime.setOnFrameCallback(frameOutput, onFrame)
  }, [runtime, frameOutput, onFrame])

  // 6. Return :)
  return frameOutput
}
