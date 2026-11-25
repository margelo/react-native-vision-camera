package com.margelo.nitro.camera.extensions

import com.margelo.nitro.camera.CameraOrientation

val CameraOrientation.degrees: Int
  get() {
    return when (this) {
      CameraOrientation.UP -> 0
      CameraOrientation.DOWN -> 180
      CameraOrientation.LEFT -> 90
      CameraOrientation.RIGHT -> 270
    }
  }

fun CameraOrientation.Companion.fromDegrees(degrees: Int): CameraOrientation {
  val normalizedDegrees = normalizeDegrees(degrees)
  return when (normalizedDegrees) {
    in 45..135 -> CameraOrientation.LEFT
    in 135..225 -> CameraOrientation.DOWN
    in 225..315 -> CameraOrientation.RIGHT
    else -> CameraOrientation.UP
  }
}

private fun CameraOrientation.Companion.normalizeDegrees(degrees: Int): Int {
  val normalized = degrees % 360
  if (normalized < 0) {
    return normalized + 360
  }
  return normalized
}

/**
 * Returns the logical counter-orientation
 * of this current CameraOrientation, aka flipping it.
 */
fun CameraOrientation.counterRotated(): CameraOrientation {
  return when (this) {
    CameraOrientation.UP -> CameraOrientation.UP
    CameraOrientation.DOWN -> CameraOrientation.DOWN
    CameraOrientation.LEFT -> CameraOrientation.RIGHT
    CameraOrientation.RIGHT -> CameraOrientation.LEFT
  }
}
