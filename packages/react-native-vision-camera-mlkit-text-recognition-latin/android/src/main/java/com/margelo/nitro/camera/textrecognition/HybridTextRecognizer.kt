package com.margelo.nitro.camera.textrecognition

import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.camera.textrecognition.extensions.await
import com.margelo.nitro.camera.textrecognition.extensions.toInputImage
import com.margelo.nitro.core.Promise
import com.margelo.nitro.image.HybridImageSpec

class HybridTextRecognizer : HybridTextRecognizerSpec() {
  private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

  override fun recognizeText(frame: HybridFrameSpec): HybridRecognizedTextSpec {
    return HybridRecognizedText(Tasks.await(recognizer.process(frame.toInputImage())))
  }

  override fun recognizeTextAsync(frame: HybridFrameSpec): Promise<HybridRecognizedTextSpec> =
    process(frame.toInputImage())

  override fun recognizeTextInImage(image: HybridImageSpec): HybridRecognizedTextSpec =
    HybridRecognizedText(Tasks.await(recognizer.process(image.toInputImage())))

  override fun recognizeTextInImageAsync(image: HybridImageSpec): Promise<HybridRecognizedTextSpec> =
    process(image.toInputImage())

  private fun process(image: InputImage): Promise<HybridRecognizedTextSpec> = Promise.async {
    HybridRecognizedText(recognizer.process(image).await())
  }

  override fun dispose() {
    super.dispose()
    recognizer.close()
  }
}
