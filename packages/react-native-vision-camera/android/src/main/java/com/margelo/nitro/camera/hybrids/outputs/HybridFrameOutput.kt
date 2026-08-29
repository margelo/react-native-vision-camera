package com.margelo.nitro.camera.hybrids.outputs

import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.resolutionselector.ResolutionSelector
import com.margelo.nitro.camera.CameraOrientation
import com.margelo.nitro.camera.FrameDroppedReason
import com.margelo.nitro.camera.FrameOutputOptions
import com.margelo.nitro.camera.HybridCameraFrameOutputSpec
import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.camera.HybridNativeThreadSpec
import com.margelo.nitro.camera.MediaType
import com.margelo.nitro.camera.MirrorMode
import com.margelo.nitro.camera.Size
import com.margelo.nitro.camera.TargetVideoPixelFormat
import com.margelo.nitro.camera.extensions.converters.toSize
import com.margelo.nitro.camera.extensions.getCameraIntrinsicCalibrationOrNull
import com.margelo.nitro.camera.extensions.orientation
import com.margelo.nitro.camera.extensions.setAllowDroppingLateFrames
import com.margelo.nitro.camera.extensions.sortedByClosestTo
import com.margelo.nitro.camera.extensions.surfaceRotation
import com.margelo.nitro.camera.extensions.toCameraIntrinsicMatrix
import com.margelo.nitro.camera.hybrids.HybridNativeThread
import com.margelo.nitro.camera.hybrids.instances.HybridFrame
import com.margelo.nitro.camera.public.NativeCameraOutput
import com.margelo.nitro.camera.utils.IdentifiableExecutor

class HybridFrameOutput(
  private val options: FrameOutputOptions,
) : HybridCameraFrameOutputSpec(),
  NativeCameraOutput {
  private val executor = IdentifiableExecutor("com.margelo.camera.frame")

  override val mediaType: MediaType = MediaType.VIDEO
  override val thread: HybridNativeThreadSpec by lazy { HybridNativeThread(executor) }
  override var outputOrientation: CameraOrientation = CameraOrientation.UP
    set(value) {
      field = value
      imageAnalysis?.targetRotation = value.surfaceRotation
    }
  override val currentResolution: Size?
    get() = imageAnalysis?.resolutionInfo?.resolution?.toSize()
  override var mirrorMode: MirrorMode = MirrorMode.AUTO

  private var imageAnalysis: ImageAnalysis? = null
    set(value) {
      field = value
      updateAnalyzer()
    }
  private var onFrame: ((HybridFrameSpec) -> Boolean)? = null
    set(value) {
      field = value
      updateAnalyzer()
    }

  private var staticCameraIntrinsicCalibration: FloatArray? = null

  override fun createUseCase(
    mirrorMode: MirrorMode,
    config: NativeCameraOutput.Config,
  ): NativeCameraOutput.PreparedUseCase {
    staticCameraIntrinsicCalibration =
      if (options.enableCameraMatrixDelivery) {
        config.cameraInfo?.getCameraIntrinsicCalibrationOrNull()
      } else {
        null
      }

    val resolutionSelector =
      ResolutionSelector
        .Builder()
        .setResolutionFilter { sizes, _ ->
          // TODO: `enablePreviewSizedOutputBuffers` is not taken into account here.
          val targetSize = options.targetResolution.toSize()
          return@setResolutionFilter sizes.sortedByClosestTo(targetSize)
        }.build()

    val imageAnalysis =
      ImageAnalysis
        .Builder()
        .apply {
          // Target Resolution
          setResolutionSelector(resolutionSelector)

          // Configuration
          setAllowDroppingLateFrames(options.dropFramesWhileBusy)
          setBackgroundExecutor(executor)

          // Set current CameraOrientation
          setTargetRotation(outputOrientation.surfaceRotation)
          setOutputImageRotationEnabled(options.enablePhysicalBufferRotation)

          when (options.pixelFormat) {
            TargetVideoPixelFormat.YUV -> {
              // Use YUV_420_888 (CPU)
              setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
            }
            TargetVideoPixelFormat.RGB -> {
              // Use RGBA_8888 (CPU + extra conversion)
              setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
            }
            TargetVideoPixelFormat.NATIVE -> {
              // Use PRIVATE (GPU)
              if (options.enablePhysicalBufferRotation) {
                throw Error(
                  "Cannot enable physical buffer rotation when `enableGpuBuffers` is set to true! " +
                    "Set `enablePhysicalBufferRotation={false}` to use GPU buffers, or disable GPU buffers if physical buffer rotation is necessary.",
                )
              }
              setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_PRIVATE)
            }
          }
        }.build()

    return NativeCameraOutput.PreparedUseCase(imageAnalysis) {
      this.imageAnalysis = imageAnalysis
      this.mirrorMode = mirrorMode
    }
  }

  /**
   * Sets or removes the ImageAnalyzer, depending on `onFrame`.
   */
  private fun updateAnalyzer() {
    val imageAnalysis = imageAnalysis ?: return
    val onFrame = onFrame

    if (onFrame != null) {
      imageAnalysis.setAnalyzer(executor) { image ->
        // This represents the Image's orientation relative to the
        // Frame Output. If `enablePhysicalBufferRotation` is true,
        // it will always be `UP` - otherwise it will be whatever
        // sensor orientation the Hardware uses, relative to current
        // target orientation.
        val orientation = image.orientation
        val isMirrored = mirrorMode == MirrorMode.ON
        val cameraIntrinsicMatrix = getCameraIntrinsicMatrix(image)
        val frame = HybridFrame(image, orientation, isMirrored, cameraIntrinsicMatrix)
        onFrame(frame)
      }
    } else {
      imageAnalysis.clearAnalyzer()
    }
  }

  private fun getCameraIntrinsicMatrix(image: ImageProxy): DoubleArray? {
    if (!options.enableCameraMatrixDelivery) return null

    val cameraIntrinsicCalibration =
      image.getCameraIntrinsicCalibrationOrNull()
        ?: staticCameraIntrinsicCalibration

    return cameraIntrinsicCalibration?.toCameraIntrinsicMatrix(image.imageInfo.sensorToBufferTransformMatrix)
  }

  override fun setOnFrameCallback(onFrame: ((HybridFrameSpec) -> Boolean)?) {
    require(executor.isRunningOnExecutor) { "setOnFrameCallback(...) must be called on the DepthFrameOutput's `thread`!" }
    this.onFrame = onFrame
  }

  override fun setOnFrameDroppedCallback(onFrameDropped: ((FrameDroppedReason) -> Unit)?) {
    // TODO: CameraX does not have a way to figure out if a Frame has been dropped or not.
  }

  override fun dispose() {
    super.dispose()
    imageAnalysis?.clearAnalyzer()
  }
}
