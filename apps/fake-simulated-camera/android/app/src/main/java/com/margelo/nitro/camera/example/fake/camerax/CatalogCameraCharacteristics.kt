package com.margelo.nitro.camera.example.fake.camerax

import android.graphics.Rect
import android.hardware.camera2.CameraCharacteristics
import android.util.Log
import android.util.Range
import android.util.Size
import org.lsposed.hiddenapibypass.HiddenApiBypass

// Authors a real android.hardware.camera2.CameraCharacteristics from a fake device, using the hidden
// CameraMetadataNative backing class. VisionCamera reads resolutions/pixel-formats from the synthesized
// SCALER_STREAM_CONFIGURATION_MAP exactly as it does on a real device, so the Android device suite can
// hard-assert them like iOS instead of deferring to the virtual-scene runner.
//
// Raw scaler configs use HAL pixel formats: IMPLEMENTATION_DEFINED (PRIVATE), YCbCr_420_888, and BLOB (JPEG).
object CatalogCameraCharacteristics {
  private const val TAG = "FakeCamera"

  private const val HAL_IMPLEMENTATION_DEFINED = 0x22 // -> ImageFormat.PRIVATE
  private const val HAL_YCbCr_420_888 = 0x23 // -> ImageFormat.YUV_420_888
  private const val HAL_BLOB = 0x21 // -> ImageFormat.JPEG
  private const val OUTPUT = 0 // ANDROID_SCALER_AVAILABLE_STREAM_CONFIGURATIONS_OUTPUT

  fun build(spec: FakeCameraDeviceSpec): CameraCharacteristics? =
    try {
      HiddenApiBypass.addHiddenApiExemptions("Landroid/hardware/camera2/")
      val nativeClass = Class.forName("android.hardware.camera2.impl.CameraMetadataNative")
      val native = nativeClass.getDeclaredConstructor().newInstance()

      val setPublic = nativeClass.getMethod("set", CameraCharacteristics.Key::class.java, Any::class.java)
      fun <T> put(key: CameraCharacteristics.Key<T>, value: T) = setPublic.invoke(native, key, value)

      val nativeKeyClass = Class.forName("android.hardware.camera2.impl.CameraMetadataNative\$Key")
      val nativeKeyCtor = nativeKeyClass.getConstructor(String::class.java, Class::class.java)
      val setRaw = nativeClass.getMethod("set", nativeKeyClass, Any::class.java)
      fun putRaw(name: String, type: Class<*>, value: Any) =
        setRaw.invoke(native, nativeKeyCtor.newInstance(name, type), value)

      val streamSizes = spec.formats.map { Size(it.width, it.height) }.distinct()
      val photoSizes = spec.formats.flatMap { it.photoDimensions }.distinct()
      val largest = (streamSizes + photoSizes).maxByOrNull { it.width.toLong() * it.height } ?: Size(1920, 1080)

      // availableStreamConfigurations: int[] of (format, width, height, isOutput) tuples.
      val configs = ArrayList<Int>()
      val minDurations = ArrayList<Long>()
      val stallDurations = ArrayList<Long>()
      fun addConfig(halFormat: Int, size: Size, minDurationNs: Long, stallNs: Long) {
        configs += listOf(halFormat, size.width, size.height, OUTPUT)
        minDurations += listOf(halFormat.toLong(), size.width.toLong(), size.height.toLong(), minDurationNs)
        stallDurations += listOf(halFormat.toLong(), size.width.toLong(), size.height.toLong(), stallNs)
      }
      for (size in streamSizes) {
        addConfig(HAL_IMPLEMENTATION_DEFINED, size, 33_333_333L, 0L)
        addConfig(HAL_YCbCr_420_888, size, 33_333_333L, 0L)
      }
      for (size in photoSizes) {
        addConfig(HAL_BLOB, size, 33_333_333L, 33_333_333L)
      }
      putRaw("android.scaler.availableStreamConfigurations", IntArray::class.java, configs.toIntArray())
      putRaw("android.scaler.availableMinFrameDurations", LongArray::class.java, minDurations.toLongArray())
      putRaw("android.scaler.availableStallDurations", LongArray::class.java, stallDurations.toLongArray())

      put(
        CameraCharacteristics.LENS_FACING,
        if (spec.position == "front") CameraCharacteristics.LENS_FACING_FRONT else CameraCharacteristics.LENS_FACING_BACK,
      )
      put(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE, Rect(0, 0, largest.width, largest.height))
      put(CameraCharacteristics.SENSOR_INFO_PIXEL_ARRAY_SIZE, Size(largest.width, largest.height))
      put(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS, floatArrayOf(spec.focalLength.toFloat()))
      put(CameraCharacteristics.LENS_INFO_AVAILABLE_APERTURES, floatArrayOf(spec.lensAperture.toFloat()))
      put(
        CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES,
        spec.formats.flatMap { it.fpsRanges }.map { Range(it.first, it.second) }.distinct().toTypedArray(),
      )
      put(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE, Range(spec.zoom.first.toFloat(), spec.zoom.second.toFloat()))
      put(CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL, CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL_FULL)
      put(
        CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES,
        intArrayOf(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_BACKWARD_COMPATIBLE),
      )
      put(CameraCharacteristics.SCALER_CROPPING_TYPE, CameraCharacteristics.SCALER_CROPPING_TYPE_CENTER_ONLY)
      put(CameraCharacteristics.DISTORTION_CORRECTION_AVAILABLE_MODES, intArrayOf(0))

      val ctor = CameraCharacteristics::class.java.getDeclaredConstructor(nativeClass)
      ctor.isAccessible = true
      val characteristics = ctor.newInstance(native) as CameraCharacteristics

      val map = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
      Log.i(
        TAG,
        "characteristics ${spec.id}: formats=${map?.outputFormats?.joinToString()} " +
          "videoSizes=${map?.getOutputSizes(HAL_YCbCr_420_888)?.joinToString()}",
      )
      characteristics
    } catch (t: Throwable) {
      Log.e(TAG, "characteristics build failed for ${spec.id}; falling back to null", t)
      null
    }
}
