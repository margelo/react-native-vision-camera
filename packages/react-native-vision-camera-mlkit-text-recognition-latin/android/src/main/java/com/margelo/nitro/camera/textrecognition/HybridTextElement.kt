package com.margelo.nitro.camera.textrecognition

import com.google.mlkit.vision.text.Text
import com.margelo.nitro.camera.textrecognition.extensions.toNitroPoints
import com.margelo.nitro.camera.textrecognition.extensions.toNitroRect

class HybridTextElement(private val element: Text.Element) : HybridTextElementSpec() {
  override val text: String get() = element.text
  override val boundingBox: TextRect? get() = element.boundingBox.toNitroRect()
  override val cornerPoints: Array<TextPoint> get() = element.cornerPoints.toNitroPoints()
  override val recognizedLanguages: Array<HybridRecognizedLanguageSpec>
    get() = arrayOf(HybridRecognizedLanguage(element.recognizedLanguage))
  override val symbols: Array<HybridTextSymbolSpec>
    get() = element.symbols.map { HybridTextSymbol(it) }.toTypedArray<HybridTextSymbolSpec>()
  override val confidence: Double get() = element.confidence.toDouble()
  override val angle: Double get() = element.angle.toDouble()
}
