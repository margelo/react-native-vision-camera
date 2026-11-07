package com.margelo.nitro.camera.extensions

import android.hardware.camera2.CameraCharacteristics
import androidx.camera.camera2.adapter.PhysicalCameraInfoAdapter
import androidx.camera.core.CameraInfo
import com.margelo.nitro.camera.DeviceType
import com.margelo.nitro.camera.utils.ImageFormatUtils
import kotlin.math.atan2
import kotlin.math.hypot

val CameraInfo.deviceType: DeviceType
  get() {
    if (this is PhysicalCameraInfoAdapter) {
      // A physical Camera is typed by its own field of view, like in VisionCamera 4.
      // `intrinsicZoomRatio` is relative to the default Camera at this position, so the main lens
      // could land just below or above `1` and be typed as ultra-wide-angle or telephoto.
      val fieldOfView = cameraCharacteristicsOrNull?.maxFieldOfView ?: return DeviceType.UNKNOWN
      return when {
        fieldOfView > 94 -> DeviceType.ULTRA_WIDE_ANGLE
        fieldOfView >= 60 -> DeviceType.WIDE_ANGLE
        else -> DeviceType.TELEPHOTO
      }
    }

    if (this.physicalCameraInfos.size > 1) {
      // multi-camera
      return when (this.physicalCameraInfos.size) {
        2 -> DeviceType.DUAL
        3 -> DeviceType.TRIPLE
        4 -> DeviceType.QUAD
        else -> DeviceType.UNKNOWN
      }
    } else {
      // single camera
      val cameraCharacteristics = cameraCharacteristicsOrNull
      if (cameraCharacteristics?.supportsDepthOnly == true) {
        // If it supports only DEPTH, it's a ToF Depth Camera
        return DeviceType.TIME_OF_FLIGHT_DEPTH
      }
      return when {
        intrinsicZoomRatio < 1f -> DeviceType.ULTRA_WIDE_ANGLE
        intrinsicZoomRatio > 1f -> DeviceType.TELEPHOTO
        else -> DeviceType.WIDE_ANGLE
      }
    }
  }

private val CameraCharacteristics.supportsDepthOnly: Boolean
  get() {
    val map =
      this[CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP]
        ?: return false
    val supportedFormats = map.outputFormats
    val isAllDepthFormats = supportedFormats.all { ImageFormatUtils.isDepthFormat(it) }
    return isAllDepthFormats
  }

/**
 * The diagonal field of view of this Camera at its shortest focal length, in degrees,
 * or `null` if it does not report its focal lengths or sensor size.
 */
private val CameraCharacteristics.maxFieldOfView: Double?
  get() {
    val sensorSize = this[CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE] ?: return null
    val focalLength = this[CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS]?.minOrNull() ?: return null
    if (sensorSize.width <= 0f || sensorSize.height <= 0f || focalLength <= 0f) return null
    val sensorDiagonal = hypot(sensorSize.width.toDouble(), sensorSize.height.toDouble())
    return Math.toDegrees(2.0 * atan2(sensorDiagonal, 2.0 * focalLength))
  }
