package com.margelo.nitro.camera.extensions.converters

import android.annotation.SuppressLint
import androidx.camera.core.impl.utils.Exif
import com.margelo.nitro.camera.CameraOrientation
import com.margelo.nitro.camera.PhotoContainerFormat
import com.margelo.nitro.camera.PhotoFile
import com.margelo.nitro.camera.extensions.fromDegrees
import java.io.File

@SuppressLint("RestrictedApi")
fun PhotoFile.Companion.fromFile(
  file: File,
  imageFormat: Int,
  timestamp: Double,
  isMirrored: Boolean,
): PhotoFile {
  val exif = Exif.createFromFile(file)
  val containerFormat = PhotoContainerFormat.fromImageFormat(imageFormat)
  return PhotoFile(
    filePath = file.absolutePath,
    width = exif.width.toDouble(),
    height = exif.height.toDouble(),
    orientation = CameraOrientation.fromDegrees(exif.rotation),
    isMirrored = isMirrored,
    timestamp = timestamp,
    isRawPhoto = containerFormat == PhotoContainerFormat.DNG,
    containerFormat = containerFormat,
  )
}
