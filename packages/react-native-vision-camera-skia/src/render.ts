import { type SkCanvas, type SkImage, Skia } from '@shopify/react-native-skia'
import type { Frame, NativeBuffer } from 'react-native-vision-camera'
import {
  normalizeRotationDegrees,
  orientationToDegrees,
} from './OrientationUtils'
import { getSurface } from './SurfacesCache'

/**
 * Represents the state for rendering
 * a Frame.
 */
export interface SkiaOnFrameState {
  /**
   * The {@linkcode Frame} wrapped as a drawable
   * GPU-texture.
   *
   * The `frameTexture` can either be drawn to
   * the {@linkcode canvas} directly in which
   * case it will just be displayed as-is, or
   * drawn with a `paint`, in which case it will
   * be used as an input texture for sampling it
   * inside a Skia Shader.
   *
   * @example
   * ```ts
   * // Draw as-is:
   * canvas.drawImage(frameTexture, 0, 0)
   * // Draw with shader:
   * const paint = ...
   * const shader = ...
   * paint.setShader(shader)
   * canvas.drawImage(frameTexture, 0, 0, paint)
   * ```
   */
  frameTexture: SkImage
  /**
   * The GPU-canvas to draw the {@linkcode frameTexture}
   * in.
   * @example
   * ```ts
   * canvas.drawImage(frameTexture, 0, 0)
   * ```
   */
  canvas: SkCanvas
}

/**
 * Renders the given {@linkcode Frame} to a {@linkcode SkImage}
 * and returns it.
 * @param frame The {@linkcode Frame} to render. It will be converted to a Texture.
 * @param onDraw A provided draw function to perform the rendering.
 * @internal
 * @worklet
 */
export function renderToTexture(
  frame: Frame,
  onDraw: (state: SkiaOnFrameState) => void,
): SkImage {
  'worklet'
  let nativeBuffer: NativeBuffer | undefined
  let frameTexture: SkImage | undefined
  try {
    // 1. Compute target dimensions
    const isLandscape =
      frame.orientation === 'left' || frame.orientation === 'right'
    const outWidth = isLandscape ? frame.height : frame.width
    const outHeight = isLandscape ? frame.width : frame.height

    // 2. Get drawable offscreen surface (cached per Thread & Size)
    const surface = getSurface(outWidth, outHeight)
    // 3. Make a Texture from the Frame (via NativeBuffer)
    nativeBuffer = frame.getNativeBuffer()
    frameTexture = Skia.Image.MakeImageFromNativeBuffer(nativeBuffer.pointer)
    // 4. Prepare a Canvas for drawing
    const canvas = surface.getCanvas()

    // 5. Apply any transforms to cancel Frame orientation/mirrored
    canvas.save()
    {
      const rotation = orientationToDegrees(frame.orientation)
      const counterRotation = normalizeRotationDegrees(rotation * -1)
      // Move it to the center so we rotate around center origin
      canvas.translate(outWidth / 2, outHeight / 2)
      // Skia applies these in reverse order: mirror source pixels before rotation.
      canvas.rotate(counterRotation, 0, 0)
      if (frame.isMirrored) {
        canvas.scale(-1, 1)
      }
      // Counter back the center origin transforms
      if (isLandscape) {
        canvas.translate(-(outHeight / 2), -(outWidth / 2))
      } else {
        canvas.translate(-(outWidth / 2), -(outHeight / 2))
      }
    }

    // 6. Draw!
    onDraw({ frameTexture, canvas })

    // 7. Restore canvas transforms
    canvas.restore()

    // 8. Snapshot the Surface contents to get it into an SkImage
    const snapshot = surface.makeImageSnapshot()
    return snapshot
  } finally {
    // 9. Dispose everything that we allocated
    frameTexture?.dispose()
    nativeBuffer?.release()
  }
}
