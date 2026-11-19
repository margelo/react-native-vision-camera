import type { HybridObject } from 'react-native-nitro-modules'
import type { Frame } from 'react-native-vision-camera'
import type { ChannelOrder, DataType, PixelLayout } from './OutputFormat'
import type { Resizer } from './Resizer.nitro'

/**
 * The mode tells the GPU resize pipeline how to map
 * the input image into the output bounds when the
 * aspect ratio doesn't match.
 *
 * - `'cover'`: Fill the whole output and keep the input aspect ratio.
 *   This performs a centered crop on the longer source axis.
 * - `'contain'`: Keep the full source image visible and preserve aspect ratio.
 *   This adds black bars (letterboxing/pillarboxing) where needed.
 * - `'stretch'`: Fill the whole output by stretching the input independently
 *   on each axis. The aspect ratio is NOT preserved — the input is squashed
 *   or stretched as needed to exactly match the output dimensions. No bars,
 *   no cropping.
 */
export type ScaleMode = 'cover' | 'contain' | 'stretch'

/**
 * Configures how a {@linkcode Resizer} samples the source
 * {@linkcode Frame} when the output is smaller than it.
 *
 * - `'bilinear'`: One bilinear sample per output pixel. Fastest, but
 *   a large downscale skips most of the source, so thin lines and
 *   fine detail alias.
 * - `'area'`: Averages the source pixels each output pixel covers,
 *   like OpenCV's `INTER_AREA` (up to 8x8 samples per output pixel).
 *   An upscale takes a single sample, the same as `'bilinear'`.
 */
export type DownscaleFilter = 'bilinear' | 'area'

/**
 * Configures options for a {@linkcode Resizer}.
 */
export interface ResizerOptions {
  /**
   * Configures the width the {@linkcode Resizer} will
   * resize {@linkcode Frame}s to.
   */
  width: number
  /**
   * Configures the height the {@linkcode Resizer} will
   * resize {@linkcode Frame}s to.
   */
  height: number
  /**
   * Configures the output {@linkcode ChannelOrder}
   * the {@linkcode Resizer} will write for each resized pixel.
   */
  channelOrder: ChannelOrder
  /**
   * Configures the scalar {@linkcode DataType} the
   * {@linkcode Resizer} will use for each output channel.
   */
  dataType: DataType
  /**
   * Configures the resize behavior when input and output
   * aspect ratios differ.
   *
   * - `'cover'`: Perform a centered crop to fill the full output.
   * - `'contain'`: Keep the full source image and pad remaining output
   *   areas with black bars.
   * - `'stretch'`: Stretch the input independently on each axis to exactly
   *   fill the output. Does NOT preserve aspect ratio.
   */
  scaleMode: ScaleMode
  /**
   * Configures how the individual channels per pixel are arranged in memory.
   *
   * - Use {@linkcode PixelLayout | 'interleaved'} if your ML model input tensor is (N)HWC shaped - e.g.: `[1, H, W, 3]`
   * - Use {@linkcode PixelLayout | 'planar'} if your ML model input tensor is (N)CHW shaped - e.g.: `[1, 3, H, W]`.
   *
   * @see {@linkcode PixelLayout}
   */
  pixelLayout: PixelLayout
  /**
   * Configures how the source is sampled when the output
   * is smaller than it.
   *
   * @default 'bilinear'
   * @see {@linkcode DownscaleFilter}
   */
  downscaleFilter?: DownscaleFilter
}

/**
 * The {@linkcode ResizerFactory} creates instances of a {@linkcode Resizer}.
 *
 * @example
 * ```ts
 * const factory = ...
 * const resizer = await factory.createResizer({
 *   width: 192,
 *   height: 192,
 *   channelOrder: 'rgb',
 *   dataType: 'float32',
 *   pixelLayout: 'planar'
 * })
 * ```
 */
export interface ResizerFactory
  extends HybridObject<{ ios: 'swift'; android: 'c++' }> {
  /**
   * Returns whether the GPU-accelerated resizer pipeline is supported
   * on this device.
   *
   * - On iOS, this requires the Metal GPU framework, which is always available.
   * - On Android, this requires the Vulkan GPU framework and `AHardwareBuffer*`
   * extensions, which are only available on newer Android versions.
   */
  isAvailable(): boolean

  /**
   * Creates a new {@linkcode Resizer} with the given {@linkcode ResizerOptions}.
   */
  createResizer(options: ResizerOptions): Promise<Resizer>
}
