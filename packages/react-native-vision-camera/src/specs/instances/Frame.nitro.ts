import type { HybridObject } from 'react-native-nitro-modules'
import type { CameraOrientation } from '../common-types/CameraOrientation'
import type { NativeBuffer } from '../common-types/NativeBuffer'
import type { PixelFormat } from '../common-types/PixelFormat'
import type { Point } from '../common-types/Point'
import type {
  CameraFrameOutput,
  FrameOutputOptions,
} from '../outputs/CameraFrameOutput.nitro'
import type { CameraOutput } from '../outputs/CameraOutput.nitro'
import type { CameraOutputConfiguration } from '../session/CameraOutputConfiguration'

// Note to self: don't use external types (such as Nitro `Image`) in `Frame` directly,
// as other consumers (Frame Processor Plugins) won't be able to depend on it without
// also declaring a dependency on the external type (such as Nitro `Image`).

/**
 * Represents a single Plane of a **planar** {@linkcode Frame}.
 *
 * @see {@linkcode Frame.getPlanes | Frame.getPlanes()}
 */
export interface FramePlane
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /**
   * Returns the width of this Plane.
   *
   * @note If this Plane (or its parent Frame) is invalid ({@linkcode isValid}),
   * this just returns `0`.
   */
  readonly width: number
  /**
   * Returns the height of this Plane.
   *
   * @note If this Plane (or its parent Frame) is invalid ({@linkcode isValid}),
   * this just returns `0`.
   */
  readonly height: number
  /**
   * Get the number of bytes per row of the
   * underlying pixel buffer.
   *
   * @see {@linkcode width}
   * @see {@linkcode getPixelBuffer | getPixelBuffer()}
   */
  readonly bytesPerRow: number
  /**
   * Gets whether this {@linkcode FramePlane} (or its parent {@linkcode Frame})
   * is still valid, or not.
   *
   * If the Plane is invalid, you cannot access its data anymore.
   * A Plane is automatically invalidated via {@linkcode HybridObject.dispose | dispose()}.
   */
  readonly isValid: boolean
  /**
   * Gets the {@linkcode FramePlane}'s pixel data as an `ArrayBuffer`.
   *
   * @discussion
   * This does **not** perform a copy, but since the {@linkcode Frame}'s data is stored
   * on the GPU, it might lazily perform a GPU -> CPU download.
   *
   * @discussion
   * Once the {@linkcode FramePlane} gets invalidated ({@linkcode isValid} == false),
   * this ArrayBuffer is no longer safe to access.
   *
   * @note If this Plane (or its parent Frame) is invalid ({@linkcode isValid}),
   * this method throws.
   */
  getPixelBuffer(): ArrayBuffer
}

/**
 * Represents a single Frame the Camera "sees".
 *
 * @discussion
 * Typically, a {@linkcode CameraOutput} like
 * {@linkcode CameraFrameOutput} produces
 * instances of this type.
 *
 * @discussion
 * The Frame is either **planar** or **non-planar** ({@linkcode isPlanar}).
 * - A **planar** Frame's (often YUV) pixel data can be accessed on
 * the CPU via {@linkcode getPlanes | Frame.getPlanes()}, where each
 * {@linkcode FramePlane} represents one plane of the pixel data. In YUV,
 * this is often 1 **Y** Plane in full resolution, and 1 **UV** Plane in half
 * resolution. In this case, {@linkcode getPixelBuffer | Frame.getPixelBuffer()}'s
 * behaviour is undefined - sometimes it contains the whole pixel data in a
 * contiguous block of memory, sometimes it just contains the data in the control block.
 * - A **non-planar** Frame's (often RGB) pixel data can be accessed
 * on the CPU via {@linkcode getPixelBuffer | Frame.getPixelBuffer()} as one
 * contiguous block of memory. In this case, {@linkcode getPlanes | Frame.getPlanes()}
 * will return an empty array (`[]`).
 *
 * It is recommended to not rely on {@linkcode getPixelBuffer | Frame.getPixelBuffer()}
 * for **planar** Frames.
 *
 * @discussion
 * Frames have to be disposed (see {@linkcode Frame.dispose | dispose()})
 * to free up the memory, otherwise the producing pipeline
 * might stall.
 */
export interface Frame
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /**
   * Gets the presentation timestamp this Frame was timed at.
   *
   * @note If this Frame is invalid ({@linkcode isValid}), this just returns `0`.
   */
  readonly timestamp: number
  /**
   * Gets whether this Frame is still valid, or not.
   * If the Frame is invalid, you cannot access its data anymore.
   * A Frame is automatically invalidated via {@linkcode HybridObject.dispose | dispose()}.
   */
  readonly isValid: boolean
  /**
   * Gets the total width of the Frame.
   *
   * If this is a planar Frame (see {@linkcode isPlanar}),
   * the individual planes (see {@linkcode getPlanes | getPlanes()})
   * will likely have different widths than the total width.
   * For example, a YUV Frame's UV Plane is half the size of its Y Plane.
   *
   * @note If this Frame is invalid ({@linkcode isValid}), this just returns `0`.
   */
  readonly width: number
  /**
   * Gets the total height of the Frame.
   *
   * If this is a planar Frame (see {@linkcode isPlanar}),
   * the individual planes (see {@linkcode getPlanes | getPlanes()})
   * will likely have different heights than the total height.
   * For example, a YUV Frame's UV Plane is half the size of its Y Plane.
   *
   * @note If this Frame is invalid ({@linkcode isValid}), this just returns `0`.
   */
  readonly height: number
  /**
   * Get the number of bytes per row of the
   * underlying pixel buffer.
   *
   * This may return `0` if the {@linkcode Depth}
   * is planar, in which case you should get the
   * number of bytes per row of individual planes
   * using {@linkcode getPlanes | getPlanes()} /
   * {@linkcode FramePlane.bytesPerRow}.
   *
   * @see {@linkcode width}
   * @see {@linkcode getPixelBuffer | getPixelBuffer()}
   */
  readonly bytesPerRow: number
  /**
   * Gets the {@linkcode PixelFormat} of this Frame's pixel data.
   * Common formats are {@linkcode PixelFormat | 'yuv-420-8-bit-video'}
   * for native YUV Frames, {@linkcode PixelFormat | 'rgb-bgra-8-bit'}
   * for processed RGB Frames, or {@linkcode PixelFormat | 'private'} for
   * zero-copy GPU-only Frames.
   *
   * @note
   * Frames are usually not in Depth Pixel Formats (like
   * {@linkcode PixelFormat | 'depth-32-bit'}) unless they
   * have been manually converted from a {@linkcode Depth} Frame to
   * a {@linkcode Frame}.
   *
   * @discussion
   * If the {@linkcode Frame} is a GPU-only buffer, its {@linkcode pixelFormat}
   * is {@linkcode PixelFormat | 'private'}, wich allows zero-copy importing it
   * into GPU pipelines directly, however its pixel data is likely not accessible
   * on the CPU.
   * You can use {@linkcode getNativeBuffer | getNativeBuffer()} to get a handle
   * to the native GPU-based buffer, which can be used in GPU pipelines like
   * Skia, or custom implementations using OpenGL/Vulkan/Metal shaders with
   * external texture importers.
   *
   * @note If this Frame is invalid ({@linkcode isValid}), this just returns
   * {@linkcode PixelFormat | 'unknown'}.
   */
  readonly pixelFormat: PixelFormat
  /**
   * The rotation of this {@linkcode Frame} relative to the
   * {@linkcode CameraOutput}'s target output orientation. (see
   * {@linkcode CameraOutput.outputOrientation})
   *
   * Frames are not automatically rotated to `'up'` because physically
   * rotating buffers is expensive. The Camera streams frames in the
   * hardware's native orientation and adjusts presentation later using
   * metadata (such as EXIF), transforms, or here; a flag.
   *
   * Examples:
   * - `'up'` — The Frame is already correctly oriented.
   * - `'right'` — The pixel data is rotated +90° relative to the desired orientation.
   * - `'left'` — The pixel data is rotated -90° relative to the desired orientation.
   * - `'down'` — The pixel data is rotated 180° upside down relative to the desired orientation.
   *
   * @discussion
   * If you process the Frame, **you** must interpret the
   * pixel data in this {@linkcode Frame} to be rotated by
   * this `orientation`.
   * In rendering libraries you would typically counter-rotate
   * the {@linkcode Frame} by this `orientation` to get
   * it "up-right".
   *
   * Most ML libraries (for example Google MLKit) accept an
   * orientation flag for input images - pass `orientation`
   * directly in those cases.
   */
  readonly orientation: CameraOrientation
  /**
   * Indicates whether this {@linkcode Frame}'s pixel data must be
   * interpreted as mirrored along the vertical axis.
   *
   * This value is always relative to the target output's mirror mode.
   * (see {@linkcode CameraOutputConfiguration.mirrorMode})
   *
   * Frames are not automatically mirroring their pixels
   * because physically mirroring buffers is expensive.
   * The Camera streams frames in the hardware's native
   * mirroring mode and adjusts presentation later using
   * metadata (such as EXIF), transforms, or here; a flag.
   *
   * - If the output is mirrored but the underlying pixel buffer is NOT,
   *   `isMirrored` will be `true`. You must treat the pixels as flipped
   *   (for example, read them right-to-left).
   * - If both the output and the pixel buffer are mirrored
   *   (for example when {@linkcode FrameOutputOptions.enablePhysicalBufferRotation}
   *   is enabled), `isMirrored` will be `false` because the buffer already
   *   matches the output orientation.
   * - If neither the output nor the pixel buffer are mirrored,
   *   `isMirrored` will be `false`.
   *
   * @discussion
   * If you process the Frame, **you** must interpret the
   * pixel data in this {@linkcode Frame} as mirrored if
   * `isMirrored` is true.
   * In rendering libraries you would typically scale the
   * {@linkcode Frame} by `-1` on the X axis if it is mirrored
   * to cancel out the mirroring at render time.
   *
   * Most ML libraries (for example Google MLKit) accept a mirroring flag for
   * input images — pass `isMirrored` directly in those cases.
   */
  readonly isMirrored: boolean
  /**
   * Returns whether this {@linkcode Frame} is **planar** or **non-planar**.
   * - If a Frame is **planar** (e.g. YUV), you should only access its pixel buffer
   * via {@linkcode getPlanes | getPlanes()} instead of {@linkcode getPixelBuffer | getPixelBuffer()}.
   * - If a Frame is **non-planar** (e.g. RGB), you can access its pixel buffer
   * via {@linkcode getPixelBuffer | getPixelBuffer()} instead of {@linkcode getPlanes | getPlanes()}.
   *
   * @note If this Frame is invalid ({@linkcode isValid}), this just returns `false`.
   */
  readonly isPlanar: boolean

  /**
   * Get whether this {@linkcode Frame} has a CPU-accessible
   * Pixel Buffer attached to it.
   *
   * @discussion
   * Usually a {@linkcode Frame} has an application-accessible Pixel Buffer
   * if its {@linkcode pixelFormat} is application-accessible - aka
   * every {@linkcode PixelFormat} except for {@linkcode PixelFormat | 'private'}.
   * On iOS, every Frame has an application-accessible Pixel Buffer.
   *
   * @see {@linkcode getPixelBuffer | getPixelBuffer()}
   */
  readonly hasPixelBuffer: boolean
  /**
   * Get whether this {@linkcode Frame} has a Native Buffer
   * attached to it.
   *
   * @discussion
   * A Native Buffer can be sampled on the GPU as an external texture,
   * or used in Media Encoder APIs.
   *
   * @discussion
   * Usually a {@linkcode Frame} has a Native Buffer if the platform
   * supports it. Only legacy platforms don't support Native Buffers.
   *
   * @see {@linkcode getNativeBuffer | getNativeBuffer()}
   * @see {@linkcode NativeBuffer}
   */
  readonly hasNativeBuffer: boolean

  /**
   * Returns each plane of a **planar** Frame (see {@linkcode isPlanar}).
   * If this Frame is **non-planar**, this method returns an empty array (`[]`).
   *
   * @throws If this Frame is invalid ({@linkcode isValid}).
   */
  getPlanes(): FramePlane[]

  /**
   * Gets the {@linkcode Frame}'s entire pixel data as a full contiguous `ArrayBuffer`,
   * if it contains one.
   *
   * @discussion
   * - If the frame is planar (see {@linkcode isPlanar | Frame.isPlanar}, e.g. YUV), this
   * might or might not contain valid data.
   * - If the frame is **not** planar (e.g. RGB), this will contain the entire pixel data.
   *
   * @discussion
   * This does **not** perform a copy, but since the {@linkcode Frame}'s data is stored
   * on the GPU, it might lazily perform a GPU -> CPU download.
   *
   * @discussion
   * Once the {@linkcode Frame} gets invalidated ({@linkcode isValid} == false),
   * this ArrayBuffer is no longer safe to access.
   *
   * @throws If this Frame is invalid ({@linkcode isValid}) or
   * {@linkcode hasPixelBuffer | hasPixelBuffer} is false.
   *
   * @example
   * ```ts
   * if (frame.hasPixelBuffer) {
   *   const pixelBuffer = frame.getPixelBuffer()
   *   console.log(`Frame has ${pixelBuffer.byteLength} bytes.`)
   * }
   * ```
   */
  getPixelBuffer(): ArrayBuffer

  /**
   * Get a {@linkcode NativeBuffer} that points to
   * this {@linkcode Frame}.
   *
   * This is a shared contract between libraries to pass
   * Native Buffers around without natively typed bindings.
   *
   * The Native Buffer can be sampled by the GPU as an
   * external texture, or passed to Media Encoder APIs.
   *
   * The {@linkcode NativeBuffer} must be released
   * again by its consumer via {@linkcode NativeBuffer.release | release()},
   * otherwise the Camera pipeline might stall.
   *
   * @discussion
   * Libraries like Skia or WebGPU implement Native Buffer APIs.
   *
   * @throws If {@linkcode hasNativeBuffer | hasNativeBuffer} is false.
   *
   * @example
   * ```ts
   * if (frame.hasNativeBuffer) {
   *   const nativeBuffer = frame.getNativeBuffer()
   *   console.log(`Native Buffer pointer: ${nativeBuffer.pointer}`)
   *   nativeBuffer.release()
   * }
   * ```
   * @example
   * Import a `Frame` into Skia via `NativeBuffer`
   * ```ts
   * if (frame.hasNativeBuffer) {
   *   const nativeBuffer = frame.getNativeBuffer()
   *   const image = Skia.Image.MakeImageFromNativeBuffer(nativeBuffer.pointer)
   *   // Render `image` via Skia APIs
   *   image.dispose()
   *   nativeBuffer.release()
   * }
   * ```
   * @example
   * Import a `Frame` into WebGPU via `NativeBuffer`
   * ```ts
   * const device = ... // WebGPU device
   * if (frame.hasNativeBuffer) {
   *   const nativeBuffer = frame.getNativeBuffer()
   *   const videoFrame = RNWebGPU.createVideoFrameFromNativeBuffer(nativeBuffer.pointer)
   *   const externalTexture = device.importExternalTexture({
   *     source: videoFrame,
   *     label: 'camera-frame'
   *   })
   *   // After submitting commands that sample `externalTexture`:
   *   externalTexture.destroy()
   *   videoFrame.release()
   *   nativeBuffer.release()
   * }
   * ```
   */
  getNativeBuffer(): NativeBuffer

  /**
   * Gets the Camera intrinsic matrix for this Frame.
   *
   * The returned array is a 3x3 matrix with column-major ordering.
   * Its origin is the top-left of the Frame.
   *
   * ```
   * K = [ fx   s  cx ]
   *     [  0  fy  cy ]
   *     [  0   0   1 ]
   * ```
   * - `fx`, `fy`: focal length in pixels
   * - `s`: skew
   * - `cx`, `cy`: principal point in pixels
   *
   *
   * @note The {@linkcode Frame} only has a Camera intrinsic matrix attached
   * if {@linkcode FrameOutputOptions.enableCameraMatrixDelivery | enableCameraMatrixDelivery}
   * is set to true on the `CameraFrameOutput`.
   * @note On Android, VisionCamera first reads the per-frame Camera2
   * {@link https://developer.android.com/reference/android/hardware/camera2/CaptureResult#LENS_INTRINSIC_CALIBRATION | CaptureResult.LENS_INTRINSIC_CALIBRATION}
   * value, and falls back to the static Camera2
   * {@link https://developer.android.com/reference/android/hardware/camera2/CameraCharacteristics#LENS_INTRINSIC_CALIBRATION | CameraCharacteristics.LENS_INTRINSIC_CALIBRATION}
   * value if the per-frame value is unavailable. The Camera2 calibration is
   * transformed into Frame coordinates before it is exposed here.
   * @example
   * ```ts
   * const matrix = frame.cameraIntrinsicMatrix
   * const fx = matrix[0]
   * const fy = matrix[4]
   * ```
   */
  readonly cameraIntrinsicMatrix?: number[]

  /**
   * Converts the given {@linkcode cameraPoint} in
   * camera sensor coordinates into a {@linkcode Point}
   * in Frame coordinates, relative to this {@linkcode Frame}.
   *
   * @note Camera sensor coordinates are not necessarily normalized from `0.0` to `1.0`. Some implementations may have a different opaque coordinate system.
   * @example
   * ```ts
   * const cameraPoint = { x: 0.5, y: 0.5 }
   * const framePoint = frame.convertCameraPointToFramePoint(cameraPoint)
   * console.log(framePoint) // { x: 960, y: 360 }
   * ```
   */
  convertCameraPointToFramePoint(cameraPoint: Point): Point
  /**
   * Converts the given {@linkcode framePoint} in
   * Frame coordinates relative to this {@linkcode Frame}
   * into a {@linkcode Point} in camera sensor coordinates.
   *
   * @note Camera sensor coordinates are not necessarily normalized from `0.0` to `1.0`. Some implementations may have a different opaque coordinate system.
   * @example
   * ```ts
   * const framePoint = { x: frame.width / 2, y: frame.height / 2 }
   * const cameraPoint = frame.convertFramePointToCameraPoint(framePoint)
   * console.log(cameraPoint) // { x: 0.5, y: 0.5 }
   * ```
   */
  convertFramePointToCameraPoint(framePoint: Point): Point
}
