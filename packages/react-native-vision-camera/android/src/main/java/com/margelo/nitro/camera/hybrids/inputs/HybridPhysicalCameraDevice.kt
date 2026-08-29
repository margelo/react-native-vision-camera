package com.margelo.nitro.camera.hybrids.inputs

import android.annotation.SuppressLint
import android.os.Build
import androidx.camera.core.CameraInfo
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
import com.margelo.nitro.camera.extensions.deviceType
import com.margelo.nitro.camera.extensions.focalLength
import com.margelo.nitro.camera.extensions.getDefaultSimulatedAperture
import com.margelo.nitro.camera.extensions.localizedName
import com.margelo.nitro.camera.extensions.position
import com.margelo.nitro.camera.public.NativeCameraDevice

/**
 * Holds a [CameraInfo] ([androidx.camera.camera2.adapter.PhysicalCameraInfoAdapter]) to expose
 * information about this physical part of a virtual [CameraInfo].
 *
 * This type has less available information than the combined [CameraInfo].
 */
@SuppressLint("RestrictedApi")
class HybridPhysicalCameraDevice(
  override val cameraInfo: CameraInfo,
) : HybridCameraDeviceSpec(),
  NativeCameraDevice {
  private val cameraCharacteristics = cameraInfo.cameraCharacteristicsOrNull

  override val id: String
    get() = cameraInfo.cameraIdOrNull ?: ""

  override val modelID: String
    get() = "physical:$position:$id"

  override val localizedName: String
    get() = cameraInfo.localizedName

  override val manufacturer: String
    get() = Build.MANUFACTURER

  override val type: DeviceType
    get() = cameraInfo.deviceType

  override val position: CameraPosition
    get() = cameraInfo.position

  override val physicalDevices: Array<HybridCameraDeviceSpec> = emptyArray()
  override val isVirtualDevice: Boolean = false
  override val supportedPixelFormats: Array<PixelFormat> = emptyArray()
  override val supportsPhotoHDR: Boolean = false
  override val supportedVideoDynamicRanges: Array<DynamicRange> = emptyArray()
  override val supportedFPSRanges: Array<Range> = emptyArray()
  override val focalLength: Double?
    get() = cameraCharacteristics?.focalLength?.toDouble()
  override val lensAperture: Double
    get() = cameraCharacteristics?.getDefaultSimulatedAperture() ?: 0.0

  // TODO: CameraX should expose more information on PhysicalCameraInfoAdapter, as this info
  //       is available in Camera2. See https://issuetracker.google.com/issues/496096527.
  override val isContinuityCamera: Boolean = false
  override val companionDeskViewCamera: HybridCameraDeviceSpec? = null
  override val supportsFocusMetering: Boolean = false
  override val supportsFocusLocking: Boolean = false
  override val supportsSmoothAutoFocus: Boolean = false
  override val supportsExposureMetering: Boolean = false
  override val supportsPreviewImage: Boolean = false
  override val supportsSpeedQualityPrioritization: Boolean = false
  override val supportsExposureBias: Boolean = false
  override val minExposureBias: Double = 0.0
  override val maxExposureBias: Double = 0.0
  override val supportsExposureLocking: Boolean = false
  override val supportsWhiteBalanceMetering: Boolean = false
  override val supportsWhiteBalanceLocking: Boolean = false
  override val maxWhiteBalanceGain: Double = 0.0
  override val hasFlash: Boolean = false
  override val hasTorch: Boolean = false
  override val supportsTorchStrength: Boolean = false
  override val minTorchStrength: Double = 0.0
  override val maxTorchStrength: Double = 0.0
  override val supportsLowLightBoost: Boolean = false
  override val minZoom: Double = 0.0
  override val maxZoom: Double = 0.0
  override val neutralZoom: Double = 1.0
  override val zoomLensSwitchFactors: DoubleArray = doubleArrayOf()
  override val supportsDistortionCorrection: Boolean = false

  override fun getSupportedResolutions(outputStreamType: OutputStreamType): Array<Size> {
    return emptyArray()
  }

  override fun supportsOutput(output: HybridCameraOutputSpec): Boolean {
    return false
  }

  override fun supportsFPS(fps: Double): Boolean {
    return supportedFPSRanges.any { it.contains(fps) }
  }

  override fun supportsVideoStabilizationMode(videoStabilizationMode: TargetStabilizationMode): Boolean {
    return false
  }

  override fun supportsPreviewStabilizationMode(previewStabilizationMode: TargetStabilizationMode): Boolean {
    return false
  }

  override fun isSessionConfigSupported(config: HybridCameraSessionConfigSpec): Boolean {
    return false
  }

  override val mediaTypes: Array<MediaType> = emptyArray()
}
