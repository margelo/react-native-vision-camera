import MLKitTextRecognitionCommon

final class HybridTextLine: HybridTextLineSpec {
  private let line: TextLine

  init(line: TextLine) {
    self.line = line
    super.init()
  }

  var text: String { line.text }
  var elements: [any HybridTextElementSpec] {
    line.elements.map { HybridTextElement(element: $0) }
  }
  var boundingBox: TextRect? { line.frame.toNitroRect }
  var cornerPoints: [TextPoint] { line.cornerPoints.toNitroPoints }
  var recognizedLanguages: [any HybridRecognizedLanguageSpec] {
    line.recognizedLanguages.map { HybridRecognizedLanguage(language: $0) }
  }
  var confidence: Double? { nil }
  var angle: Double? { nil }
}
