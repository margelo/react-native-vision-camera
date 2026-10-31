import type { Image } from 'react-native-nitro-image'
import type { HybridObject } from 'react-native-nitro-modules'
import type { Depth } from '../instances/Depth.nitro'
import type { Frame } from '../instances/Frame.nitro'

/**
 * The {@linkcode FrameConverter} can convert {@linkcode Frame}s
 * and {@linkcode Depth} to {@linkcode Image}s.
 *
 * On Android, the resulting {@linkcode Image} is always upright.
 * On iOS, the resulting {@linkcode Image} follows the orientation
 * of the source {@linkcode Frame}.
 *
 * This means consumers should not assume both platforms return
 * images with the same orientation metadata or visual rotation.
 */
export interface FrameConverter
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  // Frame -> Image converter
  /**
   * Converts the given {@linkcode Frame} to an {@linkcode Image}.
   * This performs a CPU copy.
   *
   * @throws If the Frame is invalid ({@linkcode Frame.isValid}).
   */
  convertFrameToImage(frame: Frame): Image
  /**
   * Asynchronously converts this {@linkcode Frame} to an
   * {@linkcode Image}.
   * This performs a CPU copy.
   *
   * @throws If the Frame is invalid ({@linkcode Frame.isValid}).
   */
  convertFrameToImageAsync(frame: Frame): Promise<Image>

  /**
   * Converts the {@linkcode Depth} frame to an {@linkcode Image}.
   *
   * The resulting {@linkcode Image} will be a grey-scale RGB image,
   * where black pixels are far away, and white pixels are close by.
   */
  convertDepthToImage(depth: Depth): Image
  convertDepthToImageAsync(depth: Depth): Promise<Image>
}
