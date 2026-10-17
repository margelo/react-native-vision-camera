package com.margelo.nitro.camera.textrecognition

import com.google.mlkit.vision.text.Text
import com.margelo.nitro.camera.textrecognition.extensions.toNitroPoints
import com.margelo.nitro.camera.textrecognition.extensions.toNitroRect

class HybridTextSymbol(private val symbol: Text.Symbol) : HybridTextSymbolSpec() {
  override val text: String get() = symbol.text
  override val boundingBox: TextRect? get() = symbol.boundingBox.toNitroRect()
  override val cornerPoints: Array<TextPoint> get() = symbol.cornerPoints.toNitroPoints()
  override val recognizedLanguages: Array<HybridRecognizedLanguageSpec>
    get() = arrayOf(HybridRecognizedLanguage(symbol.recognizedLanguage))
  override val confidence: Double get() = symbol.confidence.toDouble()
  override val angle: Double get() = symbol.angle.toDouble()
}
