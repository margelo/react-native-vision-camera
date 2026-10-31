package com.margelo.nitro.camera.example.fake.camerax

import android.hardware.camera2.CameraCharacteristics
import androidx.camera.camera2.impl.CameraProperties
import androidx.camera.camera2.pipe.CameraId
import androidx.camera.camera2.pipe.CameraMetadata

/** Backs `Camera2CameraInfo.create(...)` so VisionCamera's `cameraId` interop returns the catalog id. */
class CatalogCameraProperties(
  cameraId: String,
  characteristics: CameraCharacteristics?,
) : CameraProperties {
  override val cameraId: CameraId = CameraId(cameraId)
  override val metadata: CameraMetadata = CatalogCameraMetadata(this.cameraId, characteristics)
}
