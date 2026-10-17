package com.margelo.nitro.camera.textrecognition

import com.google.mlkit.vision.text.Text
import com.margelo.nitro.camera.textrecognition.extensions.toNitroPoints
import com.margelo.nitro.camera.textrecognition.extensions.toNitroRect

class HybridTextBlock(private val block: Text.TextBlock) : HybridTextBlockSpec() {
  override val text: String get() = block.text
  override val lines: Array<HybridTextLineSpec>
    get() = block.lines.map { HybridTextLine(it) }.toTypedArray<HybridTextLineSpec>()
  override val boundingBox: TextRect? get() = block.boundingBox.toNitroRect()
  override val cornerPoints: Array<TextPoint> get() = block.cornerPoints.toNitroPoints()
  override val recognizedLanguages: Array<HybridRecognizedLanguageSpec>
    get() = arrayOf(HybridRecognizedLanguage(block.recognizedLanguage))
}
