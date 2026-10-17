package com.margelo.nitro.camera.textrecognition

import com.google.mlkit.vision.text.Text

class HybridRecognizedText(private val result: Text) : HybridRecognizedTextSpec() {
  override val text: String get() = result.text
  override val blocks: Array<HybridTextBlockSpec>
    get() = result.textBlocks.map { HybridTextBlock(it) }.toTypedArray<HybridTextBlockSpec>()
}
