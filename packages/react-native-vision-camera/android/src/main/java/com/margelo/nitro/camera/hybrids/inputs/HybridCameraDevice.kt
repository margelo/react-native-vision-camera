package com.margelo.nitro.camera.hybrids.inputs

import android.annotation.SuppressLint
import android.hardware.camera2.CameraCharacteristics
import android.os.Build
import androidx.annotation.OptIn
import androidx.camera.core.CameraInfo
import androidx.camera.core.ExperimentalZeroShutterLag
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageCapture
import androidx.camera.core.MeteringPoint
import androidx.camera.core.Preview
import androidx.camera.core.SurfaceOrientedMeteringPointFactory
import androidx.camera.video.Recorder
import com.margelo.nitro.camera.CameraPosition
import com.margelo.nitro.camera.DeviceType
import com.margelo.nitro.camera.DynamicRange
import com.margelo.nitro.camera.HybridCameraDeviceSpec
import com.margelo.nitro.camera.HybridCameraOutputSpec
import com.margelo.nitro.camera.HybridCameraSessionConfigSpec
import com.margelo.nitro.camera.MediaType
import com.margelo.nitro.camera.OutputStreamType
import com.margelo.nitro.camera.PixelFormat
import com.margelo.nitro.camera.Range
import com.margelo.nitro.camera.Size
import com.margelo.nitro.camera.TargetStabilizationMode
import com.margelo.nitro.camera.extensions.cameraCharacteristicsOrNull
import com.margelo.nitro.camera.extensions.cameraIdOrNull
import com.margelo.nitro.camera.extensions.contains
import com.margelo.nitro.camera.extensions.converters.from
import com.margelo.nitro.camera.extensions.converters.toSize
import com.margelo.nitro.camera.extensions.deviceType
import com.margelo.nitro.camera.extensions.focalLength
import com.margelo.nitro.camera.extensions.getDefaultSimulatedAperture
import com.margelo.nitro.camera.extensions.getDepthSizes
import com.margelo.nitro.camera.extensions.getPhotoSizes
import com.margelo.nitro.camera.extensions.getPixelFormats
import com.margelo.nitro.camera.extensions.getStreamSizes
import com.margelo.nitro.camera.extensions.getVideoSizes
import com.margelo.nitro.camera.extensions.localizedName
import com.margelo.nitro.camera.extensions.mapToArray
import com.margelo.nitro.camera.extensions.modelID
import com.margelo.nitro.camera.extensions.position
import com.margelo.nitro.camera.extensions.supportsDistortionCorrection
import com.margelo.nitro.camera.extensions.zoomLensSwitchFactors
import com.margelo.nitro.camera.public.NativeCameraDevice
import com.margelo.nitro.camera.public.NativeCameraOutput
import com.margelo.nitro.camera.public.NativeCameraSessionConfig
import com.margelo.nitro.camera.utils.ImageFormatUtils

/**
 * Holds a [CameraInfo] to expose its information to JS to conform to
 * [HybridCameraDeviceSpec].
 *
 * It tries to use as much public CameraX APIs as possible, but goes into Camera2
 * APIs if necessary.
 */
@SuppressLint("RestrictedApi")
class HybridCameraDevice(
  override val cameraInfo: CameraInfo,
) : HybridCameraDeviceSpec(),
  NativeCameraDevice {
  private val cameraCharacteristics = cameraInfo.cameraCharacteristicsOrNull
  private val previewCapabilities by lazy {
    Preview.getPreviewCapabilities(cameraInfo)
  }
  private val imageCapabilities by lazy {
    ImageCapture.getImageCaptureCapabilities(cameraInfo)
  }
  private val videoCapabilities by lazy {
    // TODO: Use `Recorder.VIDEO_CAPABILITIES_SOURCE_CODEC_CAPABILITIES` for wider range of supported resolutions?
    Recorder.getVideoCapabilities(cameraInfo)
  }

  override val supportsPhotoHDR: Boolean
    get() = imageCapabilities.supportedOutputFormats.contains(ImageCapture.OUTPUT_FORMAT_JPEG_ULTRA_HDR)
  override val supportedVideoDynamicRanges: Array<DynamicRange>
    get() = videoCapabilities.supportedDynamicRanges.mapToArray { DynamicRange.from(it) }
  override val supportedFPSRanges: Array<Range>
    get() = cameraInfo.supportedFrameRateRanges.mapToArray { Range.from(it) }

  override val id: String
    get() = cameraInfo.cameraIdOrNull ?: cameraInfo.toString()

  override val modelID: String
    get() = cameraInfo.modelID

  override val localizedName: String
    get() = cameraInfo.localizedName

  override val manufacturer: String
    get() = Build.MANUFACTURER

  override val type: DeviceType
    get() = cameraInfo.deviceType

  override val position: CameraPosition
    get() = cameraInfo.position

  override val physicalDevices: Array<HybridCameraDeviceSpec> by lazy {
    cameraInfo.physicalCameraInfos.mapToArray { HybridPhysicalCameraDevice(it) }
  }

  override val isVirtualDevice: Boolean
    get() = cameraInfo.isLogicalMultiCameraSupported
  override val supportedPixelFormats: Array<PixelFormat>
    get() = cameraCharacteristics?.getPixelFormats() ?: emptyArray()

  override val focalLength: Double?
    get() = cameraCharacteristics?.focalLength?.toDouble()

  override val lensAperture: Double
    get() = cameraCharacteristics?.getDefaultSimulatedAperture() ?: 0.0

  override val isContinuityCamera: Boolean
    get() = false

  override val companionDeskViewCamera: HybridCameraDeviceSpec?
    get() = null

  override val supportsFocusMetering: Boolean
    get() = cameraInfo.isFocusMeteringSupported(createDummyMeteringAction(FocusMeteringAction.FLAG_AF))
  override val supportsExposureMetering: Boolean
    get() = cameraInfo.isFocusMeteringSupported(createDummyMeteringAction(FocusMeteringAction.FLAG_AE))
  override val supportsWhiteBalanceMetering: Boolean
    get() = cameraInfo.isFocusMeteringSupported(createDummyMeteringAction(FocusMeteringAction.FLAG_AWB))

  // TODO: CameraX doesn't support manual Focus/Exposure/WB locking...
  override val supportsFocusLocking: Boolean
    get() = false
  override val supportsExposureLocking: Boolean
    get() = false
  override val supportsWhiteBalanceLocking: Boolean
    get() = false

  override val maxWhiteBalanceGain: Double
    get() = 0.0

  override val supportsExposureBias: Boolean
    get() = cameraInfo.exposureState.isExposureCompensationSupported
  override val minExposureBias: Double
    get() =
      cameraInfo.exposureState.exposureCompensationRange.lower
        .toDouble()
  override val maxExposureBias: Double
    get() =
      cameraInfo.exposureState.exposureCompensationRange.upper
        .toDouble()

  override val supportsSmoothAutoFocus: Boolean
    get() = false

  override val supportsPreviewImage: Boolean
    get() {
      val imageCapabilities = ImageCapture.getImageCaptureCapabilities(cameraInfo)
      return imageCapabilities.isPostviewSupported
    }
  override val supportsSpeedQualityPrioritization: Boolean
    @OptIn(ExperimentalZeroShutterLag::class)
    get() = cameraInfo.isZslSupported

  override val hasFlash: Boolean
    get() = cameraInfo.hasFlashUnit()

  override val hasTorch: Boolean
    get() = cameraInfo.hasFlashUnit()

  override val supportsTorchStrength: Boolean
    get() = cameraInfo.isTorchStrengthSupported

  override val minTorchStrength: Double
    get() {
      if (!supportsTorchStrength) return 0.0
      // Torch Strength ranges [1, maxTorchStrengthLevel]
      return 1.0
    }

  override val maxTorchStrength: Double
    get() {
      if (!supportsTorchStrength) return 0.0
      return cameraInfo.maxTorchStrengthLevel.toDouble()
    }

  override val supportsLowLightBoost: Boolean
    get() = cameraInfo.isLowLightBoostSupported

  override val minZoom: Double
    get() {
      val zoomState = cameraInfo.zoomState.value ?: return 0.0
      return zoomState.minZoomRatio.toDouble()
    }
  override val maxZoom: Double
    get() {
      val zoomState = cameraInfo.zoomState.value ?: return 0.0
      return zoomState.maxZoomRatio.toDouble()
    }
  override val neutralZoom: Double = 1.0
  override val zoomLensSwitchFactors: DoubleArray
    get() = cameraInfo.zoomLensSwitchFactors

  override val supportsDistortionCorrection: Boolean
    get() = cameraCharacteristics?.supportsDistortionCorrection ?: false

  override fun getSupportedResolutions(outputStreamType: OutputStreamType): Array<Size> {
    val cameraCharacteristics = cameraCharacteristics ?: return emptyArray()
    val sizes =
      when (outputStreamType) {
        OutputStreamType.PHOTO -> cameraCharacteristics.getPhotoSizes()
        OutputStreamType.VIDEO -> cameraCharacteristics.getVideoSizes()
        OutputStreamType.STREAM -> cameraCharacteristics.getStreamSizes()
        OutputStreamType.DEPTH_PHOTO, OutputStreamType.DEPTH_STREAM -> cameraCharacteristics.getDepthSizes()
      }
    return sizes.mapToArray { it.toSize() }
  }

  override fun supportsOutput(output: HybridCameraOutputSpec): Boolean {
    return output is NativeCameraOutput
  }

  override fun supportsFPS(fps: Double): Boolean {
    return supportedFPSRanges.any { range -> range.contains(fps) }
  }

  override fun supportsVideoStabilizationMode(videoStabilizationMode: TargetStabilizationMode): Boolean {
    return when (videoStabilizationMode) {
      TargetStabilizationMode.OFF -> true
      TargetStabilizationMode.AUTO -> true
      TargetStabilizationMode.STANDARD -> videoCapabilities.isStabilizationSupported
      TargetStabilizationMode.CINEMATIC -> false
      TargetStabilizationMode.CINEMATIC_EXTENDED -> false
      TargetStabilizationMode.CINEMATIC_EXTENDED_ENHANCED -> false
      TargetStabilizationMode.PREVIEW_OPTIMIZED -> false
      TargetStabilizationMode.LOW_LATENCY -> false
    }
  }

  override fun supportsPreviewStabilizationMode(previewStabilizationMode: TargetStabilizationMode): Boolean {
    return when (previewStabilizationMode) {
      TargetStabilizationMode.OFF -> true
      TargetStabilizationMode.AUTO -> true
      TargetStabilizationMode.STANDARD -> previewCapabilities.isStabilizationSupported
      TargetStabilizationMode.CINEMATIC -> false
      TargetStabilizationMode.CINEMATIC_EXTENDED -> false
      TargetStabilizationMode.CINEMATIC_EXTENDED_ENHANCED -> false
      TargetStabilizationMode.PREVIEW_OPTIMIZED -> false
      TargetStabilizationMode.LOW_LATENCY -> false
    }
  }

  override fun isSessionConfigSupported(config: HybridCameraSessionConfigSpec): Boolean {
    val config =
      config as? NativeCameraSessionConfig
        ?: throw Error("`config` is not of type `NativeCameraSessionConfig`!")
    return cameraInfo.isSessionConfigSupported(config.sessionConfig)
  }

  override val mediaTypes: Array<MediaType>
    get() {
      val streamMap =
        cameraCharacteristics?.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
      if (streamMap != null) {
        // Get available output formats to determine media types
        val result = arrayListOf<MediaType>()
        val hasVideo = streamMap.outputFormats.any { ImageFormatUtils.isVideoFormat(it) }
        if (hasVideo) {
          result.add(MediaType.VIDEO)
        }
        val hasDepth = streamMap.outputFormats.any { ImageFormatUtils.isDepthFormat(it) }
        if (hasDepth) {
          result.add(MediaType.DEPTH)
        }
        return result.toTypedArray()
      } else {
        // Just assume VIDEO works
        return arrayOf(MediaType.VIDEO)
      }
    }

  companion object {
    val dummyCenterPoint: MeteringPoint by lazy {
      val factory = SurfaceOrientedMeteringPointFactory(1f, 1f)
      return@lazy factory.createPoint(0.5f, 0.5f)
    }

    fun createDummyMeteringAction(meteringMode: Int): FocusMeteringAction {
      return FocusMeteringAction
        .Builder(dummyCenterPoint, meteringMode)
        .build()
    }
  }
}
