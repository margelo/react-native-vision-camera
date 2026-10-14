package com.margelo.nitro.camera.barcodescanner

import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.camera.barcodescanner.extensions.await
import com.margelo.nitro.camera.barcodescanner.extensions.toInputImage
import com.margelo.nitro.camera.barcodescanner.extensions.toMLBarcodeScannerOptions
import com.margelo.nitro.core.Promise
import com.margelo.nitro.image.HybridImageSpec

class HybridBarcodeScanner(
  options: BarcodeScannerOptions,
) : HybridBarcodeScannerSpec() {
  private val scanner = BarcodeScanning.getClient(options.toMLBarcodeScannerOptions())

  @OptIn(ExperimentalGetImage::class)
  override fun scanCodes(frame: HybridFrameSpec): Array<HybridBarcodeSpec> {
    val inputImage = frame.toInputImage()
    val task = scanner.process(inputImage)
    val barcodes = Tasks.await(task)
    return barcodes
      .map { HybridBarcode(it) }
      .toTypedArray<HybridBarcodeSpec>()
  }

  override fun scanCodesAsync(frame: HybridFrameSpec): Promise<Array<HybridBarcodeSpec>> {
    val inputImage = frame.toInputImage()
    return process(inputImage)
  }

  override fun scanCodesInImage(image: HybridImageSpec): Array<HybridBarcodeSpec> {
    val inputImage = image.toInputImage()
    val barcodes = Tasks.await(scanner.process(inputImage))
    return barcodes.map { HybridBarcode(it) }.toTypedArray<HybridBarcodeSpec>()
  }

  override fun scanCodesInImageAsync(image: HybridImageSpec): Promise<Array<HybridBarcodeSpec>> {
    val inputImage = image.toInputImage()
    return process(inputImage)
  }

  private fun process(inputImage: InputImage): Promise<Array<HybridBarcodeSpec>> {
    return Promise.async {
      val barcodes = scanner.process(inputImage).await()
      return@async barcodes.map { HybridBarcode(it) }.toTypedArray<HybridBarcodeSpec>()
    }
  }

  override fun dispose() {
    super.dispose()
    scanner.close()
  }
}
