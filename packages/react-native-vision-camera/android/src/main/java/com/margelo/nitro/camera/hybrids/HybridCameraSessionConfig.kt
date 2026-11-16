package com.margelo.nitro.camera.hybrids

import androidx.camera.core.SessionConfig
import com.margelo.nitro.camera.AutoFocusSystem
import com.margelo.nitro.camera.HybridCameraSessionConfigSpec
import com.margelo.nitro.camera.PixelFormat
import com.margelo.nitro.camera.Size
import com.margelo.nitro.camera.TargetDynamicRange
import com.margelo.nitro.camera.TargetStabilizationMode
import com.margelo.nitro.camera.public.NativeCameraOutput
import com.margelo.nitro.camera.public.NativeCameraSessionConfig

class HybridCameraSessionConfig(
  override val sessionConfig: SessionConfig,
  private val resolvedConfig: NativeCameraOutput.Config,
) : HybridCameraSessionConfigSpec(),
  NativeCameraSessionConfig {
  override val selectedFPS: Double?
    get() = resolvedConfig.fpsRange?.upper?.toDouble()

  // CameraX does not expose an authoritative use-case resolution until after
  // binding. Keep this absent here; callers can continue using an output's
  // currentResolution from the later configured callback on Android.
  override val selectedVideoResolution: Size?
    get() = null

  override val selectedVideoStabilizationMode: TargetStabilizationMode?
    get() = resolvedConfig.videoStabilizationMode

  override val selectedPreviewStabilizationMode: TargetStabilizationMode?
    get() = resolvedConfig.previewStabilizationMode

  override val selectedVideoDynamicRange: TargetDynamicRange?
    get() = resolvedConfig.videoDynamicRange

  override val isPhotoHDREnabled: Boolean
    get() = resolvedConfig.photoHDR ?: false

  override val nativePixelFormat: PixelFormat
    // TODO: Do we always stream in PRIVATE?
    get() = PixelFormat.PRIVATE

  override val autoFocusSystem: AutoFocusSystem
    // TODO: Is PHASE_DETECTION correct on Android? Should we expose UNKNOWN instead?
    get() = AutoFocusSystem.PHASE_DETECTION

  override val isBinned: Boolean
    // In CameraX, currently every stream is binned - see https://issuetracker.google.com/issues/500394299
    get() = true

  override fun toString(): String {
    val components =
      arrayOf(
        "config: $sessionConfig",
        "selectedFPS: $selectedFPS",
        "selectedVideoResolution: $selectedVideoResolution",
        "selectedVideoStabilizationMode: $selectedVideoStabilizationMode",
        "selectedPreviewStabilizationMode: $selectedPreviewStabilizationMode",
        "selectedVideoDynamicRange: $selectedVideoDynamicRange",
        "isPhotoHDREnabled: $isPhotoHDREnabled",
      )
    return "CameraSessionConfig(${components.joinToString(", ")})"
  }
}
