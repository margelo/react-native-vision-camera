package com.margelo.nitro.camera.example.fake.camerax

import android.graphics.ImageFormat
import android.graphics.Rect
import android.hardware.camera2.CameraCharacteristics
import android.media.EncoderProfiles
import android.media.MediaRecorder
import android.util.Log
import android.util.Range
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraXConfig
import androidx.camera.core.DynamicRange
import androidx.camera.core.impl.CameraDeviceSurfaceManager
import androidx.camera.core.impl.CameraFactory
import androidx.camera.core.impl.EncoderProfilesProvider
import androidx.camera.core.impl.EncoderProfilesProxy
import androidx.camera.core.impl.UseCaseConfigFactory
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.testing.fakes.FakeCamera
import androidx.camera.testing.fakes.FakeCameraInfoInternal
import androidx.camera.testing.impl.fakes.FakeCameraCoordinator
import androidx.camera.testing.impl.fakes.FakeCameraDeviceSurfaceManager
import androidx.camera.testing.impl.fakes.FakeEncoderProfilesProvider
import androidx.camera.testing.impl.fakes.FakeUseCaseConfigFactory

// Builds a CameraX backend from the catalog: one FakeCamera per device, wired so VisionCamera's untouched
// CameraX + Camera2 interop paths observe catalog values.
object FakeCameraCatalogConfig {
  private const val TAG = "FakeCamera"

  fun create(catalog: FakeCameraCatalog): CameraXConfig {
    val cameraFactory = CatalogCameraFactory(catalog.devices.associate { spec -> spec.id to buildCamera(spec) })
    return CameraXConfig.Builder()
      .setCameraFactoryProvider { _, _, _, _, _, _ -> cameraFactory }
      .setDeviceSurfaceManagerProvider { _, _, _, _ -> FakeCameraDeviceSurfaceManager() }
      .setUseCaseConfigFactoryProvider { _, _ -> FakeUseCaseConfigFactory() }
      .build()
  }

  private fun buildCamera(spec: FakeCameraDeviceSpec): FakeCamera {
    val info = FakeCameraInfoInternal(
      spec.id,
      /* sensorRotation= */ 0,
      if (spec.position == "front") CameraSelector.LENS_FACING_FRONT else CameraSelector.LENS_FACING_BACK,
      androidx.camera.core.internal.StreamSpecsCalculator.NO_OP_STREAM_SPECS_CALCULATOR,
    )
    info.setHasFlashUnit(spec.hasFlash)
    info.setZoom(1f, spec.zoom.first.toFloat(), spec.zoom.second.toFloat(), 0f)
    // intrinsicZoomRatio drives VisionCamera's DeviceType: < 1 ultra-wide, > 1 telephoto, else wide.
    info.setIntrinsicZoomRatio(
      when (spec.type) {
        "ultra-wide-angle" -> 0.5f
        "telephoto" -> 2.0f
        else -> 1.0f
      },
    )
    info.setExposureState(0, Range(spec.exposureBias.first, spec.exposureBias.second), android.util.Rational(1, 6), spec.supportsExposure)
    info.setIsFocusMeteringSupported(spec.supportsFocus || spec.supportsExposure || spec.supportsWhiteBalance)
    val anyStabilization = spec.formats.any { it.videoStabilizationModes.isNotEmpty() }
    info.setVideoStabilizationSupported(anyStabilization)
    info.setIsPreviewStabilizationSupported(anyStabilization)
    info.setSupportedFrameRateRanges(spec.formats.flatMap { it.fpsRanges }.map { Range(it.first, it.second) }.toSet())

    val supportsHdr = spec.formats.any { it.videoHDR }
    val dynamicRanges = if (supportsHdr) setOf(DynamicRange.SDR, DynamicRange.HLG_10_BIT) else setOf(DynamicRange.SDR)
    info.setSupportedDynamicRanges(dynamicRanges)
    info.setEncoderProfilesProvider(encoderProfiles(spec, supportsHdr))

    val streamSizes = spec.formats.map { Size(it.width, it.height) }.distinct()
    val photoSizes = spec.formats.flatMap { it.photoDimensions }.distinct()
    info.setSupportedResolutions(ImageFormat.PRIVATE, streamSizes)
    info.setSupportedResolutions(ImageFormat.YUV_420_888, streamSizes)
    info.setSupportedResolutions(ImageFormat.JPEG, photoSizes)
    if (spec.formats.any { it.highestPhotoQuality || it.highPhotoQuality }) {
      info.setSupportedResolutions(ImageFormat.JPEG_R, photoSizes)
    }

    val largest = photoSizes.maxByOrNull { it.width.toLong() * it.height } ?: Size(1920, 1080)
    info.setSensorRect(Rect(0, 0, largest.width, largest.height))

    // Camera2 interop: hand VisionCamera's untouched cameraId path a Camera2CameraInfo with the catalog id.
    // Real CameraCharacteristics stay null for now (VisionCamera falls back to CameraInfo; the scene runner
    // covers resolution/pixel-format assertions).
    val characteristics: CameraCharacteristics? = null
    info.setUnwrapper(
      object : FakeCameraInfoInternal.Unwrapper {
        override fun <T> unwrapAs(type: Class<T>): T? = when (type) {
          Camera2CameraInfo::class.java -> type.cast(Camera2CameraInfo.create(CatalogCameraProperties(spec.id, characteristics)))
          CameraCharacteristics::class.java -> characteristics?.let { type.cast(it) }
          else -> null
        }
      },
    )
    Log.i(TAG, "built fake camera ${spec.id} (${spec.position}) hdr=$supportsHdr stabilization=$anyStabilization characteristics=${characteristics != null}")
    return FakeCamera(spec.id, null, info)
  }

  private fun encoderProfiles(spec: FakeCameraDeviceSpec, supportsHdr: Boolean): EncoderProfilesProvider {
    val builder = FakeEncoderProfilesProvider.Builder()
    val size = spec.formats.map { Size(it.width, it.height) }.maxByOrNull { it.width.toLong() * it.height } ?: Size(1920, 1080)
    val fps = spec.formats.flatMap { it.fpsRanges }.maxOf { it.second }
    val videoProfiles = mutableListOf(videoProfile(size, fps, bitDepth = 8, hdrFormat = EncoderProfiles.VideoProfile.HDR_NONE))
    if (supportsHdr) {
      videoProfiles.add(videoProfile(size, fps, bitDepth = 10, hdrFormat = EncoderProfiles.VideoProfile.HDR_HLG))
    }
    val audio = EncoderProfilesProxy.AudioProfileProxy.create(
      MediaRecorder.AudioEncoder.AAC, "audio/mp4a-latm", 128_000, 44_100, 1, EncoderProfilesProxy.CODEC_PROFILE_NONE,
    )
    val profiles = EncoderProfilesProxy.ImmutableEncoderProfilesProxy.create(
      /* defaultDurationSeconds= */ 30, MediaRecorder.OutputFormat.MPEG_4, listOf(audio), videoProfiles,
    )
    // CamcorderProfile.QUALITY_HIGH + QUALITY_2160P/1080P/720P all resolve to this profile.
    for (quality in intArrayOf(1, 8, 6, 5, 0)) {
      builder.add(quality, profiles)
    }
    return builder.build()
  }

  private fun videoProfile(size: Size, fps: Int, bitDepth: Int, hdrFormat: Int): EncoderProfilesProxy.VideoProfileProxy =
    EncoderProfilesProxy.VideoProfileProxy.create(
      MediaRecorder.VideoEncoder.HEVC,
      "video/hevc",
      /* bitrate= */ 10_000_000,
      /* frameRate= */ fps,
      size.width,
      size.height,
      EncoderProfilesProxy.CODEC_PROFILE_NONE,
      bitDepth,
      EncoderProfiles.VideoProfile.YUV_420,
      hdrFormat,
    )
}
