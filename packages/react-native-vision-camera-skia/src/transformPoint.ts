import type {
  CameraOrientation,
  Frame,
  Point,
} from 'react-native-vision-camera'

/**
 * Describes how a {@linkcode Frame}'s pixel data is oriented relative to the
 * target output's coordinate system.
 *
 * @see {@linkcode transformPoint}
 */
export interface Transform {
  /**
   * The rotation of the source pixel data relative to the target output.
   */
  orientation: CameraOrientation
  /**
   * Whether the source pixel data is mirrored along the vertical axis relative
   * to the target output.
   */
  isMirrored: boolean
}

/**
 * Transforms the given {@linkcode normalizedPoint}
 * (values ranging from `0...1`) using the
 * given {@linkcode orientation} and {@linkcode isMirrored}
 */
export function transformPoint(
  normalizedPoint: Point,
  { orientation, isMirrored }: Transform,
): Point {
  let result = normalizedPoint

  // Now rotate to camera coordinate system
  switch (orientation) {
    case 'up':
      // no rotation
      break
    case 'down':
      result = { x: 1 - result.x, y: 1 - result.y }
      break
    case 'left':
      result = { x: result.y, y: 1 - result.x }
      break
    case 'right':
      result = { x: 1 - result.y, y: result.x }
      break
  }

  if (isMirrored) {
    result = { x: 1 - result.x, y: result.y }
  }

  return result
}
