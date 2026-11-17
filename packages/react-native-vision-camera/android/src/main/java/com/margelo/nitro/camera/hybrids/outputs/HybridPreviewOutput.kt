package com.margelo.nitro.camera.hybrids.outputs

import android.util.Log
import androidx.camera.core.Preview
import com.margelo.nitro.camera.CameraOrientation
import com.margelo.nitro.camera.HybridCameraPreviewOutputSpec
import com.margelo.nitro.camera.MediaType
import com.margelo.nitro.camera.MirrorMode
import com.margelo.nitro.camera.PreviewConfiguration
import com.margelo.nitro.camera.PreviewOutputOptions
import com.margelo.nitro.camera.Size
import com.margelo.nitro.camera.TargetStabilizationMode
import com.margelo.nitro.camera.extensions.converters.fromMirrorMode
import com.margelo.nitro.camera.extensions.converters.toMirrorMode
import com.margelo.nitro.camera.extensions.converters.toSize
import com.margelo.nitro.camera.extensions.surfaceRotation
import com.margelo.nitro.camera.hybrids.orientation.HybridInterfaceOrientationManager
import com.margelo.nitro.camera.public.NativeCameraOutput
import com.margelo.nitro.camera.public.NativePreviewOutput

class HybridPreviewOutput(
  private val options: PreviewOutputOptions,
) : HybridCameraPreviewOutputSpec(),
  NativeCameraOutput,
  NativePreviewOutput {
  private val orientationManager = HybridInterfaceOrientationManager()
  override var currentConfiguration: PreviewConfiguration? = null
    private set

  override val mediaType: MediaType = MediaType.VIDEO
  override var outputOrientation: CameraOrientation
    get() = orientationManager.currentOrientation ?: CameraOrientation.UP
    set(value) {
      // Setting orientation on a Preview output does nothing,
      // as its orientation is always driven by the `orientationManager`.
    }
  override val mirrorMode: MirrorMode
    get() {
      val preview = preview ?: return MirrorMode.AUTO
      return MirrorMode.fromMirrorMode(preview.mirrorMode)
    }
  override val currentResolution: Size?
    get() = preview?.resolutionInfo?.resolution?.toSize()
  override val rotationDegrees: Double?
    get() = preview?.resolutionInfo?.rotationDegrees?.toDouble()
  private var preview: Preview? = null
  private var surfaceProvider: Preview.SurfaceProvider? = null

  private fun startOrientationUpdates() {
    orientationManager.startOrientationUpdates { orientation ->
      preview?.let { preview ->
        preview.targetRotation = orientation.surfaceRotation
        updatePreviewConfiguration(preview, "interface orientation changed")
      }
    }
  }

  override fun setSurfaceProvider(surfaceProvider: Preview.SurfaceProvider) {
    this.surfaceProvider = surfaceProvider
    startOrientationUpdates()
    preview?.surfaceProvider = surfaceProvider
  }

  override fun removeSurfaceProvider(surfaceProvider: Preview.SurfaceProvider) {
    if (this.surfaceProvider == surfaceProvider) {
      this.surfaceProvider = null
      preview?.surfaceProvider = null
      orientationManager.stopOrientationUpdates()
    }
  }

  override fun createUseCase(
    mirrorMode: MirrorMode,
    config: NativeCameraOutput.Config,
  ): NativeCameraOutput.PreparedUseCase {
    val preview =
      Preview
        .Builder()
        .apply {
          // isMirrored={...}
          setMirrorMode(mirrorMode.toMirrorMode())

          // stabilizationMode={...}
          when (config.previewStabilizationMode) {
            TargetStabilizationMode.OFF -> {
              // Stabilization is explicitly disabled.
              setPreviewStabilizationEnabled(false)
            }
            null, TargetStabilizationMode.AUTO -> {
              // Unspecified - might be enabled, might be disabled.
            }
            else -> {
              // Stabilization is explicitly enabled, no matter if it's `STANDARD`, `CINEMATIC`, etc - Android only knows "ON".
              setPreviewStabilizationEnabled(true)
            }
          }
        }.build()

    return NativeCameraOutput.PreparedUseCase(preview) {
      this.preview = preview
      orientationManager.currentOrientation?.let { orientation ->
        this.preview?.targetRotation = orientation.surfaceRotation
      }
      this.preview?.surfaceProvider = surfaceProvider
      updatePreviewConfiguration(preview, "use case attached")
    }
  }

  private fun updatePreviewConfiguration(
    preview: Preview,
    source: String,
  ) {
    val resolutionInfo = preview.resolutionInfo ?: return
    val configuration =
      PreviewConfiguration(
        resolution = resolutionInfo.resolution.toSize(),
        rotationDegrees = resolutionInfo.rotationDegrees.toDouble(),
      )
    if (configuration == currentConfiguration) return
    currentConfiguration = configuration

    Log.i(
      TAG,
      "Preview configuration changed ($source): ${resolutionInfo.resolution.width}x${resolutionInfo.resolution.height} @ ${resolutionInfo.rotationDegrees}°",
    )
    options.onConfigurationChanged?.invoke(configuration)
  }

  override fun dispose() {
    super.dispose()
    orientationManager.stopOrientationUpdates()
    currentConfiguration = null
  }
}
