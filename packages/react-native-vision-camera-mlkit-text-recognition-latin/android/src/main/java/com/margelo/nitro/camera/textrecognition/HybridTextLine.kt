package com.margelo.nitro.camera.textrecognition

import com.google.mlkit.vision.text.Text
import com.margelo.nitro.camera.textrecognition.extensions.toNitroPoints
import com.margelo.nitro.camera.textrecognition.extensions.toNitroRect

class HybridTextLine(private val line: Text.Line) : HybridTextLineSpec() {
  override val text: String get() = line.text
  override val elements: Array<HybridTextElementSpec>
    get() = line.elements.map { HybridTextElement(it) }.toTypedArray<HybridTextElementSpec>()
  override val boundingBox: TextRect? get() = line.boundingBox.toNitroRect()
  override val cornerPoints: Array<TextPoint> get() = line.cornerPoints.toNitroPoints()
  override val recognizedLanguages: Array<HybridRecognizedLanguageSpec>
    get() = arrayOf(HybridRecognizedLanguage(line.recognizedLanguage))
  override val confidence: Double get() = line.confidence.toDouble()
  override val angle: Double get() = line.angle.toDouble()
}
