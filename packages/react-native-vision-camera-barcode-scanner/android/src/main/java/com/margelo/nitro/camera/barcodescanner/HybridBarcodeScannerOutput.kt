package com.margelo.nitro.camera.barcodescanner

import android.util.Size
import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.UseCase
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import com.margelo.nitro.camera.CameraOrientation
import com.margelo.nitro.camera.HybridCameraOutputSpec
import com.margelo.nitro.camera.MediaType
import com.margelo.nitro.camera.MirrorMode
import com.margelo.nitro.camera.barcodescanner.extensions.toMLBarcodeScannerOptions
import com.margelo.nitro.camera.extensions.converters.toSize
import com.margelo.nitro.camera.extensions.surfaceRotation
import com.margelo.nitro.camera.public.NativeCameraOutput
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class HybridBarcodeScannerOutput(
  private val options: BarcodeScannerOutputOptions,
) : HybridCameraOutputSpec(),
  ImageAnalysis.Analyzer,
  NativeCameraOutput {
  override val mediaType: MediaType = MediaType.VIDEO
  override var outputOrientation: CameraOrientation = CameraOrientation.UP
    get() = field
    set(value) {
      field = value
      imageAnalysis?.targetRotation = value.surfaceRotation
    }
  override val currentResolution: com.margelo.nitro.camera.Size?
    get() = imageAnalysis?.resolutionInfo?.resolution?.toSize()
  override val rotationDegrees: Double?
    get() = imageAnalysis?.resolutionInfo?.rotationDegrees?.toDouble()
  override val mirrorMode: MirrorMode = MirrorMode.AUTO
  private var imageAnalysis: ImageAnalysis? = null
  private val executor = Executors.newSingleThreadExecutor()
  private val scanner = BarcodeScanning.getClient(options.toMLBarcodeScannerOptions())
  private var isBusy = AtomicBoolean(false)
  private val recommendedResolutionForBarcodeScanning = Size(1280, 720)

  override fun createUseCase(
    mirrorMode: MirrorMode,
    config: NativeCameraOutput.Config,
  ): NativeCameraOutput.PreparedUseCase {
    val resolutionStrategy =
      if (options.outputResolution == BarcodeScannerOutputResolution.FULL) {
        ResolutionStrategy.HIGHEST_AVAILABLE_STRATEGY
      } else {
        ResolutionStrategy(recommendedResolutionForBarcodeScanning, ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER)
      }
    val resolutionSelector =
      ResolutionSelector
        .Builder()
        .setResolutionStrategy(resolutionStrategy)
        .setAllowedResolutionMode(ResolutionSelector.PREFER_HIGHER_RESOLUTION_OVER_CAPTURE_RATE)
        .build()
    val imageAnalysis =
      ImageAnalysis
        .Builder()
        .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
        .setOutputImageRotationEnabled(false)
        .setResolutionSelector(resolutionSelector)
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .build()
    return NativeCameraOutput.PreparedUseCase(imageAnalysis, {
      this.imageAnalysis = imageAnalysis
      imageAnalysis.setAnalyzer(executor, this)
    })
  }

  override fun dispose() {
    super.dispose()
    scanner.close()
    executor.close()
  }

  @OptIn(ExperimentalGetImage::class)
  override fun analyze(imageProxy: ImageProxy) {
    try {
      if (!isBusy.compareAndSet(false, true)) {
        // pipeline is busy. close image & return
        imageProxy.close()
        return
      }

      val mediaImage =
        imageProxy.image
          ?: throw Error("`ImageProxy` does not have an `Image`!")

      // TODO: Support MirrorMode?
      val inputImage = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
      scanner
        .process(inputImage)
        .addOnSuccessListener { barcodes ->
          val hybridBarcodes =
            barcodes
              .map { HybridBarcode(it) }
              .toTypedArray<HybridBarcodeSpec>()
          options.onBarcodeScanned(hybridBarcodes)
        }.addOnFailureListener { error ->
          options.onError(error)
        }.addOnCompleteListener {
          imageProxy.close()
          isBusy.set(false)
        }
    } catch (error: Throwable) {
      imageProxy.close()
      isBusy.set(false)
      options.onError(error)
    }
  }
}
