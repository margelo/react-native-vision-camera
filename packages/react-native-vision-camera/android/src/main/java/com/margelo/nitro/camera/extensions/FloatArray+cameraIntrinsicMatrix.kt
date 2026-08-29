package com.margelo.nitro.camera.extensions

import android.graphics.Matrix

fun FloatArray.toCameraIntrinsicMatrix(sensorToBufferTransform: Matrix? = null): DoubleArray? {
  if (size < 5) return null

  val fx = this[0].toDouble()
  val fy = this[1].toDouble()
  val cx = this[2].toDouble()
  val cy = this[3].toDouble()
  val s = this[4].toDouble()

  if (sensorToBufferTransform == null) {
    return doubleArrayOf(
      fx,
      0.0,
      0.0,
      s,
      fy,
      0.0,
      cx,
      cy,
      1.0,
    )
  }

  val transformValues = FloatArray(9)
  sensorToBufferTransform.getValues(transformValues)

  val a = transformValues[Matrix.MSCALE_X].toDouble()
  val b = transformValues[Matrix.MSKEW_X].toDouble()
  val c = transformValues[Matrix.MTRANS_X].toDouble()
  val d = transformValues[Matrix.MSKEW_Y].toDouble()
  val e = transformValues[Matrix.MSCALE_Y].toDouble()
  val f = transformValues[Matrix.MTRANS_Y].toDouble()
  val g = transformValues[Matrix.MPERSP_0].toDouble()
  val h = transformValues[Matrix.MPERSP_1].toDouble()
  val i = transformValues[Matrix.MPERSP_2].toDouble()

  return doubleArrayOf(
    a * fx,
    d * fx,
    g * fx,
    a * s + b * fy,
    d * s + e * fy,
    g * s + h * fy,
    a * cx + b * cy + c,
    d * cx + e * cy + f,
    g * cx + h * cy + i,
  )
}
