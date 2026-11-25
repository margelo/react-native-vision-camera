package com.margelo.nitro.camera.hybrids.outputs

import android.annotation.SuppressLint
import android.util.Log
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.resolutionselector.ResolutionSelector
import com.margelo.nitro.camera.CameraOrientation
import com.margelo.nitro.camera.DepthFrameOutputOptions
import com.margelo.nitro.camera.FrameDroppedReason
import com.margelo.nitro.camera.HybridCameraDepthFrameOutputSpec
import com.margelo.nitro.camera.HybridDepthSpec
import com.margelo.nitro.camera.HybridNativeThreadSpec
import com.margelo.nitro.camera.MediaType
import com.margelo.nitro.camera.MirrorMode
import com.margelo.nitro.camera.Size
import com.margelo.nitro.camera.extensions.converters.toSize
import com.margelo.nitro.camera.extensions.orientation
import com.margelo.nitro.camera.extensions.setAllowDroppingLateFrames
import com.margelo.nitro.camera.extensions.sortedByClosestTo
import com.margelo.nitro.camera.extensions.surfaceRotation
import com.margelo.nitro.camera.hybrids.HybridNativeThread
import com.margelo.nitro.camera.hybrids.instances.HybridDepthFrame
import com.margelo.nitro.camera.public.NativeCameraOutput
import com.margelo.nitro.camera.utils.DepthImageReaderProxy
import com.margelo.nitro.camera.utils.IdentifiableExecutor

@SuppressLint("RestrictedApi")
class HybridDepthFrameOutput(
  private val options: DepthFrameOutputOptions,
) : HybridCameraDepthFrameOutputSpec(),
  NativeCameraOutput {
  private val executor = IdentifiableExecutor("com.margelo.camera.depth").apply { setExitsWhenIdle(true) }

  override val mediaType: MediaType = MediaType.DEPTH
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

  @Volatile private var onDepthFrame: ((HybridDepthSpec) -> Boolean)? = null

  override fun createUseCase(
    mirrorMode: MirrorMode,
    config: NativeCameraOutput.Config,
  ): NativeCameraOutput.PreparedUseCase {
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
        .setResolutionSelector(resolutionSelector)
        .setTargetRotation(outputOrientation.surfaceRotation)
        .setOutputImageRotationEnabled(options.enablePhysicalBufferRotation)
        .setAllowDroppingLateFrames(options.dropFramesWhileBusy)
        .setImageReaderProxyProvider { width, height, format, queueDepth, usage ->
          // TODO: Use CameraX' default ImageAnalysis once they support DEPTH data streaming.
          return@setImageReaderProxyProvider DepthImageReaderProxy(width, height, queueDepth, usage)
        }.build()

    return NativeCameraOutput.PreparedUseCase(imageAnalysis) {
      this.imageAnalysis = imageAnalysis
      this.mirrorMode = mirrorMode
    }
  }

  /**
   * Sets or removes the ImageAnalyzer, depending on `onDepthFrame`.
   */
  private fun updateAnalyzer() {
    val imageAnalysis = imageAnalysis ?: return

    if (onDepthFrame != null) {
      imageAnalysis.setAnalyzer(executor, ::analyze)
    } else {
      imageAnalysis.clearAnalyzer()
    }
  }

  private fun analyze(image: ImageProxy) {
    // CameraX can run a Frame that it queued before the callback was removed.
    val onDepthFrame = onDepthFrame ?: return image.close()
    // This represents the Image's orientation relative to the
    // Frame Output. If `enablePhysicalBufferRotation` is true,
    // it will always be `UP` - otherwise it will be whatever
    // sensor orientation the Hardware uses, relative to current
    // target orientation.
    val orientation = image.orientation
    val isMirrored = mirrorMode == MirrorMode.ON
    val frame = HybridDepthFrame(image, orientation, isMirrored)
    try {
      onDepthFrame(frame)
    } catch (e: Exception) {
      // The callback's JS Runtime is gone. Stop delivering Frames instead of killing this Thread.
      Log.e(TAG, "onDepthFrame(...) failed, removing the Depth callback.", e)
      image.close()
      setOnDepthFrameCallback(null)
    }
  }

  override fun setOnDepthFrameCallback(onDepthFrame: ((HybridDepthSpec) -> Boolean)?) {
    require(executor.isRunningOnExecutor) { "setOnDepthFrameCallback(...) must be called on the DepthFrameOutput's `thread`!" }
    this.onDepthFrame = onDepthFrame
    executor.setExitsWhenIdle(onDepthFrame == null)
    updateAnalyzer()
  }

  override fun setOnDepthFrameDroppedCallback(onDepthFrameDropped: ((FrameDroppedReason) -> Unit)?) {
    // TODO: CameraX does not have a way to figure out if a Frame has been dropped or not.
  }

  override fun dispose() {
    super.dispose()
    onDepthFrame = null
    imageAnalysis?.clearAnalyzer()
    executor.shutdown()
  }

  companion object {
    private const val TAG = "HybridDepthFrameOutput"
  }
}
