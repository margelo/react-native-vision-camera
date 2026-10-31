package com.margelo.nitro.camera.example.fake.camerax

import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.CaptureResult
import androidx.camera.camera2.pipe.CameraExtensionMetadata
import androidx.camera.camera2.pipe.CameraId
import androidx.camera.camera2.pipe.CameraMetadata
import androidx.camera.camera2.pipe.Metadata

/**
 * The minimum [CameraMetadata] needed so [androidx.camera.camera2.interop.Camera2CameraInfo.create]
 * can hand VisionCamera a camera id. Characteristic reads go to [characteristics] when present
 * (null until the hidden-API builder lands — VisionCamera falls back to CameraInfo in that case).
 */
class CatalogCameraMetadata(
  private val cameraId: CameraId,
  private val characteristics: CameraCharacteristics?,
) : CameraMetadata {
  override val camera: CameraId = cameraId
  override val isRedacted: Boolean = false
  override val keys: Set<CameraCharacteristics.Key<*>> = emptySet()
  override val requestKeys: Set<CaptureRequest.Key<*>> = emptySet()
  override val resultKeys: Set<CaptureResult.Key<*>> = emptySet()
  override val sessionKeys: Set<CaptureRequest.Key<*>> = emptySet()
  override val sessionCharacteristicsKeys: Set<CameraCharacteristics.Key<*>> = emptySet()
  override val physicalCameraIds: Set<CameraId> = emptySet()
  override val physicalRequestKeys: Set<CaptureRequest.Key<*>> = emptySet()
  override val supportedExtensions: Set<Int> = emptySet()

  @Suppress("UNCHECKED_CAST")
  override fun <T> get(key: CameraCharacteristics.Key<T>): T? = characteristics?.get(key)

  override fun <T> getOrDefault(key: CameraCharacteristics.Key<T>, default: T): T = get(key) ?: default

  override fun <T> get(key: Metadata.Key<T>): T? = null

  override fun <T> getOrDefault(key: Metadata.Key<T>, default: T): T = default

  override fun <T : Any> unwrapAs(type: Class<T>): T? =
    if (characteristics != null && type == CameraCharacteristics::class.java) type.cast(characteristics) else null

  override suspend fun getPhysicalMetadata(cameraId: CameraId): CameraMetadata =
    throw UnsupportedOperationException("FakeCamera has no physical cameras")

  override fun awaitPhysicalMetadata(cameraId: CameraId): CameraMetadata =
    throw UnsupportedOperationException("FakeCamera has no physical cameras")

  override suspend fun getExtensionMetadata(extension: Int): CameraExtensionMetadata =
    throw UnsupportedOperationException("FakeCamera has no camera extensions")

  override fun awaitExtensionMetadata(extension: Int): CameraExtensionMetadata =
    throw UnsupportedOperationException("FakeCamera has no camera extensions")
}
