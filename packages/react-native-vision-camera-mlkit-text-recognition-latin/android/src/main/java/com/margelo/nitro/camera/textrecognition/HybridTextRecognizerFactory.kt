package com.margelo.nitro.camera.textrecognition

import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip

@DoNotStrip
@Keep
class HybridTextRecognizerFactory : HybridTextRecognizerFactorySpec() {
  override fun createTextRecognizer(): HybridTextRecognizerSpec = HybridTextRecognizer()
}
