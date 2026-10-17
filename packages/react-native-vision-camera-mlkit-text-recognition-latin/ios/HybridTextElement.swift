import MLKitTextRecognitionCommon

final class HybridTextElement: HybridTextElementSpec {
  private let element: TextElement

  init(element: TextElement) {
    self.element = element
    super.init()
  }

  var text: String { element.text }
  var boundingBox: TextRect? { element.frame.toNitroRect }
  var cornerPoints: [TextPoint] { element.cornerPoints.toNitroPoints }
  var recognizedLanguages: [any HybridRecognizedLanguageSpec] {
    element.recognizedLanguages.map { HybridRecognizedLanguage(language: $0) }
  }
  var symbols: [any HybridTextSymbolSpec] { [] }
  var confidence: Double? { nil }
  var angle: Double? { nil }
}
