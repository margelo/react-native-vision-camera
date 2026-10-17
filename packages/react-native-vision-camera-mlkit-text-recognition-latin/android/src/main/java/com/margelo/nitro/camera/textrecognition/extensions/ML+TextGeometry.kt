package com.margelo.nitro.camera.textrecognition.extensions

import android.graphics.Point as AndroidPoint
import android.graphics.Rect as AndroidRect
import com.margelo.nitro.camera.textrecognition.TextPoint
import com.margelo.nitro.camera.textrecognition.TextRect

fun AndroidRect?.toNitroRect(): TextRect? {
  val rect = this ?: return null
  return TextRect(rect.left.toDouble(), rect.right.toDouble(), rect.top.toDouble(), rect.bottom.toDouble())
}

fun Array<AndroidPoint>?.toNitroPoints(): Array<TextPoint> =
  this?.map { TextPoint(it.x.toDouble(), it.y.toDouble()) }?.toTypedArray() ?: emptyArray()
