import VisionCamera

final class HybridTextRecognizerFactory: HybridTextRecognizerFactorySpec {
  func createTextRecognizer() throws -> any HybridTextRecognizerSpec {
    return HybridTextRecognizer()
  }
}
