package com.margelo.nitro.camera.textrecognition.extensions

import com.google.mlkit.vision.common.InputImage
import com.margelo.nitro.image.HybridImage
import com.margelo.nitro.image.HybridImageSpec
import com.margelo.nitro.image.extensions.toCpuAccessible

fun HybridImageSpec.toInputImage(): InputImage {
  val image = this as? HybridImage ?: throw Error("Image is not of type `HybridImage`!")
  return InputImage.fromBitmap(image.bitmap.toCpuAccessible(), 0)
}
