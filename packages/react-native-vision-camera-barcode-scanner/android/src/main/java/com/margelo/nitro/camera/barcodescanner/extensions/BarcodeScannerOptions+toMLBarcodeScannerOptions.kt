package com.margelo.nitro.camera.barcodescanner.extensions

import com.margelo.nitro.camera.barcodescanner.BarcodeScannerOptions
import com.margelo.nitro.camera.barcodescanner.BarcodeScannerOutputOptions
import com.margelo.nitro.camera.barcodescanner.TargetBarcodeFormat

private fun com.google.mlkit.vision.barcode.BarcodeScannerOptions.Builder.setBarcodeFormats(
  barcodeFormats: Array<TargetBarcodeFormat>,
): com.google.mlkit.vision.barcode.BarcodeScannerOptions.Builder {
  val formats = barcodeFormats.map { it.toMLBarcodeFormat() }.toIntArray()
  if (formats.isEmpty()) {
    throw Error("Target barcodeFormats cannot be empty!")
  }
  setBarcodeFormats(formats.first(), *formats.copyOfRange(1, formats.size))
  return this
}

fun BarcodeScannerOptions.toMLBarcodeScannerOptions(): com.google.mlkit.vision.barcode.BarcodeScannerOptions {
  val builder =
    com.google.mlkit.vision.barcode.BarcodeScannerOptions
      .Builder()
      .setBarcodeFormats(this.barcodeFormats)
  if (this.enableAllPotentialBarcodes == true) {
    builder.enableAllPotentialBarcodes()
  }
  return builder.build()
}

fun BarcodeScannerOutputOptions.toMLBarcodeScannerOptions(): com.google.mlkit.vision.barcode.BarcodeScannerOptions {
  val builder =
    com.google.mlkit.vision.barcode.BarcodeScannerOptions
      .Builder()
      .setBarcodeFormats(this.barcodeFormats)
  if (this.enableAllPotentialBarcodes == true) {
    builder.enableAllPotentialBarcodes()
  }
  return builder.build()
}
