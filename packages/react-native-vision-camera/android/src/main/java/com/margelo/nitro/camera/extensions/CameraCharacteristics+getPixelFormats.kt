package com.margelo.nitro.camera.extensions

import android.hardware.camera2.CameraCharacteristics
import com.margelo.nitro.camera.PixelFormat
import com.margelo.nitro.camera.extensions.converters.fromImageFormat
import com.margelo.nitro.camera.utils.PixelRange

fun CameraCharacteristics.getPixelFormats(): Array<PixelFormat> {
  val streams =
    this[CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP]
      ?: return emptyArray()
  return streams.outputFormats
    .map { PixelFormat.fromImageFormat(it, PixelRange.UNKNOWN) }
    // Output formats without a pixel layout (e.g. JPEG, HEIC, RAW10) map to UNKNOWN
    // and are not streamable pixel formats, so leave them out.
    .filter { it != PixelFormat.UNKNOWN }
    .distinct()
    .toTypedArray()
}
