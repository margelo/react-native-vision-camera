import type { Sync } from 'react-native-nitro-modules'
import type { useFrameOutput } from '../../hooks/useFrameOutput'
import type { FrameDroppedReason } from '../common-types/FrameDroppedReason'
import type { NativeBuffer } from '../common-types/NativeBuffer'
import type { Size } from '../common-types/Size'
import type { TargetVideoPixelFormat } from '../common-types/VideoPixelFormat'
import type { NativeThread } from '../frame-processors/NativeThread.nitro'
import type { Frame } from '../instances/Frame.nitro'
import type { CameraSession } from '../session/CameraSession.nitro'
import type { CameraSessionConfig } from '../session/CameraSessionConfig.nitro'
import type { CameraOutput } from './CameraOutput.nitro'

// TODO: Should we remove `enablePreviewSizedOutputBuffers` and infer it from `targetResolution`?

/**
 * Configuration options for a {@linkcode CameraFrameOutput}.
 *
 * @see {@linkcode CameraFrameOutput}
 * @see {@linkcode useFrameOutput | useFrameOutput(...)}
 */
export interface FrameOutputOptions {
  /**
   * The target Frame Resolution to use.
   *
   * @discussion
   * The {@linkcode CameraSession} will negotiate all
   * output {@linkcode targetResolution}s and constraints (such
   * as HDR, FPS, etc) in a {@linkcode CameraSessionConfig} to
   * finalize the Resolution used for the Output.
   * This is therefore merely a resolution _target_, and may
   * not be exactly met.
   *
   * If the given {@linkcode targetResolution} cannot be met
   * exactly, its aspect ratio (computed by
   * {@linkcode Size.width} / {@linkcode Size.height}) will
   * be prioritized over pixel count.
   */
  targetResolution: Size

  /**
   * Deliver smaller, preview-sized output buffers for Frame Processing.
   *
   * This is useful for ML and computer vision workloads where full-resolution
   * buffers are unnecessary and would only increase memory bandwidth and
   * processing costs.
   *
   * Other camera outputs (for example {@linkcode CameraVideoOutput}) keep using
   * the full-resolution output negotiated by the {@linkcode CameraSession}.
   *
   * @default false
   */
  enablePreviewSizedOutputBuffers: boolean

  /**
   * Allow this output to start later in the capture pipeline startup process.
   *
   * Enabling this lets the camera prioritize outputs needed for preview first,
   * then start the {@linkcode CameraFrameOutput} shortly afterwards.
   *
   * This can improve startup behavior when preview responsiveness is more
   * important than receiving frame-processor frames immediately.
   *
   * @platform iOS
   */
  allowDeferredStart: boolean

  /**
   * Sets the {@linkcode TargetVideoPixelFormat} of the
   * {@linkcode CameraFrameOutput}.
   *
   * - The most efficient format is {@linkcode TargetVideoPixelFormat | 'native'},
   * which internally just uses the {@linkcode CameraSessionConfig}'s
   * {@linkcode CameraSessionConfig.nativePixelFormat | nativePixelFormat}.
   * - Some configurations may natively stream in a
   * YUV format (e.g. if {@linkcode CameraSessionConfig.nativePixelFormat | nativePixelFormat} ==
   * {@linkcode TargetVideoPixelFormat | 'yuv-420-8-bit-video'}),
   * in which case {@linkcode TargetVideoPixelFormat | 'yuv'} can also be zero overhead.
   * - If your Frame Processor absolutely requires to run in RGB, you may
   * set {@linkcode pixelFormat} to {@linkcode TargetVideoPixelFormat | 'rgb'},
   * which comes with additional processing overhead as the Camera pipeline
   * will convert native frames to RGB (e.g. to
   * {@linkcode TargetVideoPixelFormat | 'rgb-bgra-8-bit'}).
   *
   * @discussion
   * It is recommended to use {@linkcode TargetVideoPixelFormat | 'native'}
   * if possible, as this will use a zero-copy GPU-only path.
   * Other formats almost always require conversion at
   * some point, especially on Android.
   *
   * If you need CPU-access to pixels, use
   * {@linkcode TargetVideoPixelFormat | 'yuv'} instead of
   * {@linkcode TargetVideoPixelFormat | 'rgb'}  as a next best alternative,
   * as {@linkcode TargetVideoPixelFormat | 'rgb'} uses ~2.6x more bandwidth
   * than {@linkcode TargetVideoPixelFormat | 'yuv'} and requires additional
   * conversions as it is not a Camera-native format.
   *
   * Only use {@linkcode TargetVideoPixelFormat | 'rgb'} if you really need
   * to stream {@linkcode Frame}s in an RGB format.
   *
   * @discussion
   * It is recommended to use {@linkcode TargetVideoPixelFormat | 'native'} and
   * design your Frame Processing pipeline to be fully GPU-based, such as
   * performing ML model processing on the GPU/NPU and rendering via Metal/Vulkan/OpenGL
   * by importing the {@linkcode Frame} as an external sampler/texture (or via
   * Skia/WebGPU which use {@linkcode NativeBuffer} zero-copy APIs), as the
   * {@linkcode Frame}'s data will already be on the GPU then.
   * If you use a non-{@linkcode TargetVideoPixelFormat | 'native'} {@linkcode pixelFormat}
   * in a GPU pipeline, your pipeline will be noticeably slower as CPU &lt;-&gt; GPU
   * downloads/uploads will be performed on every frame.
   */
  pixelFormat: TargetVideoPixelFormat

  /**
   * Enable (or disable) physical buffer rotation.
   *
   * - When {@linkcode enablePhysicalBufferRotation} is set to `true`, and
   * the {@linkcode CameraFrameOutput}'s {@linkcode CameraFrameOutput.outputOrientation | outputOrientation}
   * is set to any value different than the Camera sensor's native orientation, the Camera pipeline
   * will physically rotate the buffers to apply the orientation.
   * The resulting {@linkcode Frame}'s {@linkcode Frame.orientation | orientation}
   * will then always be `'up'`, meaning it no longer needs to be rotated by the consumer.
   * - When {@linkcode enablePhysicalBufferRotation} is set to `false`, the Camera
   * pipeline will not physically rotate buffers, but instead only provide the {@linkcode Frame}'s
   * orientation relative to the {@linkcode CameraFrameOutput}'s target {@linkcode CameraFrameOutput.outputOrientation | outputOrientation}
   * as metadata (see {@linkcode Frame.orientation}), meaning the consumers have to
   * handle orientation themselves - e.g. by reading pixels in a different order, or
   * applying orientation in a GPU rendering pass, depending on the use-case.
   *
   * Setting {@linkcode enablePhysicalBufferRotation} to `true` introduces
   * processing overhead.
   * @default false
   */
  enablePhysicalBufferRotation: boolean

  /**
   * Gets or sets whether the {@linkcode CameraFrameOutput} attaches
   * a Camera Intrinsic Matrix to the {@linkcode Frame}s it produces.
   *
   *
   * @see {@linkcode Frame.cameraIntrinsicMatrix}
   * @throws On iOS, if video stabilization is enabled, as intrinsic matrix delivery only works when video stabilization is `'off'`.
   * @note On Android, the intrinsic matrix is read from Camera2 capture metadata
   * when available, with static camera characteristics as a fallback. Camera2
   * calibration values are transformed into Frame coordinates.
   * @default false
   */
  enableCameraMatrixDelivery: boolean

  /**
   * Whether to drop new Frames when they arrive while the
   * Frame Processor is still executing.
   *
   * - If set to `true`, the {@linkcode CameraFrameOutput} will
   * automatically drop any Frames that arrive while your Frame
   * Processor is still executing to avoid exhausting resources,
   * at the risk of loosing information since Frames may be dropped.
   * - If set to `false`, the {@linkcode CameraFrameOutput} will
   * queue up any Frames that arrive while your Frame Processor
   * is still executing and immediatelly call it once it is free
   * again, at the risk of exhausting resources and growing RAM.
   *
   * @default true
   */
  dropFramesWhileBusy: boolean
}

/**
 * The {@linkcode CameraFrameOutput} allows synchronously streaming
 * {@linkcode Frame}s from the Camera, aka "Frame Processing".
 *
 * @see {@linkcode FrameOutputOptions}
 * @see {@linkcode useFrameOutput | useFrameOutput(...)}
 * @example
 * Creating a `CameraFrameOutput` via the Hooks API:
 * ```ts
 * const frameOutput = useFrameOutput({
 *   pixelFormat: 'yuv',
 *   onFrame(frame) {
 *     'worklet'
 *     frame.dispose()
 *   }
 * })
 * ```
 *
 * @example
 * Creating a `CameraFrameOutput` via the Imperative API:
 * ```ts
 * const frameOutput = VisionCamera.createFrameOutput({
 *   targetResolution: CommonResolutions.HD_16_9,
 *   pixelFormat: 'yuv',
 *   enablePreviewSizedOutputBuffers: false,
 *   allowDeferredStart: true,
 *   enablePhysicalBufferRotation: false,
 *   enableCameraMatrixDelivery: false,
 *   dropFramesWhileBusy: true,
 * })
 * ```
 */
export interface CameraFrameOutput extends CameraOutput {
  /**
   * Get the {@linkcode NativeThread} that this {@linkcode CameraFrameOutput}
   * is running on.
   * This is the thread that {@linkcode setOnFrameCallback | setOnFrameCallback(...)}
   * callbacks run on.
   */
  readonly thread: NativeThread
  /**
   * Adds a callback that calls the given {@linkcode onFrame} function
   * every time the Camera produces a new {@linkcode Frame}.
   *
   * @throws If not called on a Worklet/Runtime running on this {@linkcode thread}.
   */
  setOnFrameCallback(onFrame: Sync<(frame: Frame) => boolean> | undefined): void
  /**
   * Adds a callback that gets called when a {@linkcode Frame} has been dropped.
   * This often happens if your Frame Callback is taking longer than a frame interval.
   */
  setOnFrameDroppedCallback(
    onFrameDropped: ((reason: FrameDroppedReason) => void) | undefined,
  ): void
}
