package com.margelo.nitro.camera.extensions

import androidx.camera.core.CameraState
import com.margelo.nitro.camera.InterruptionReason

val CameraState.StateError.reason: String
  get() {
    return when (code) {
      CameraState.ERROR_STREAM_CONFIG -> "Failed to apply the stream configuration for the given outputs!"
      CameraState.ERROR_CAMERA_IN_USE -> "Camera device is already in use!"
      CameraState.ERROR_CAMERA_DISABLED -> "Camera is disabled, probably due to a device policy!"
      CameraState.ERROR_CAMERA_REMOVED -> "Camera has been removed!"
      CameraState.ERROR_CAMERA_FATAL_ERROR -> "Encountered a fatal Camera error!"
      CameraState.ERROR_MAX_CAMERAS_IN_USE ->
        "The maximum number of open cameras has been reached, and more cameras cannot be opened until other instances are closed!"
      CameraState.ERROR_OTHER_RECOVERABLE_ERROR -> "Encountered an unknown recoverable error. The session will restart."
      CameraState.ERROR_DO_NOT_DISTURB_MODE_ENABLED -> "Camera cannot be opened while Do-Not-Disturb mode is enabled!"
      else -> {
        if (type == CameraState.ErrorType.CRITICAL) {
          "Encountered an unknown critical Camera Error! ($code)"
        } else {
          "Encountered an unknown Camera Error! The session will restart. ($code)"
        }
      }
    }
  }

val CameraState.StateError.interruptionReason: InterruptionReason
  get() {
    return when (code) {
      CameraState.ERROR_CAMERA_IN_USE -> InterruptionReason.VIDEO_DEVICE_IN_USE_BY_ANOTHER_CLIENT
      CameraState.ERROR_MAX_CAMERAS_IN_USE -> InterruptionReason.MAX_CAMERAS_IN_USE
      CameraState.ERROR_OTHER_RECOVERABLE_ERROR -> InterruptionReason.OTHER_RECOVERABLE_ERROR
      else -> InterruptionReason.UNKNOWN
    }
  }
