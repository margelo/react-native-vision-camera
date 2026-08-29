package com.margelo.nitro.camera.extensions

import android.annotation.SuppressLint
import android.hardware.camera2.CaptureResult
import androidx.camera.core.ImageProxy
import androidx.camera.core.impl.CameraCaptureResults

@SuppressLint("RestrictedApi")
fun ImageProxy.getCameraIntrinsicCalibrationOrNull(): FloatArray? {
  val captureResult = CameraCaptureResults.retrieveCameraCaptureResult(imageInfo)?.captureResult
  return captureResult?.get(CaptureResult.LENS_INTRINSIC_CALIBRATION)
}
