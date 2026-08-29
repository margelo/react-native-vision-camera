package com.margelo.nitro.camera.extensions

import android.hardware.camera2.CameraCharacteristics
import androidx.annotation.OptIn
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.CameraInfo

@OptIn(ExperimentalCamera2Interop::class)
fun CameraInfo.getCameraIntrinsicCalibrationOrNull(): FloatArray? {
  return Camera2CameraInfo
    .fromSafe(this)
    ?.getCameraCharacteristic(CameraCharacteristics.LENS_INTRINSIC_CALIBRATION)
}
