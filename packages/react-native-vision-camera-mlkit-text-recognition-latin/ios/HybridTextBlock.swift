import MLKitTextRecognitionCommon

final class HybridTextBlock: HybridTextBlockSpec {
  private let block: TextBlock

  init(block: TextBlock) {
    self.block = block
    super.init()
  }

  var text: String { block.text }
  var lines: [any HybridTextLineSpec] {
    block.lines.map { HybridTextLine(line: $0) }
  }
  var boundingBox: TextRect? { block.frame.toNitroRect }
  var cornerPoints: [TextPoint] { block.cornerPoints.toNitroPoints }
  var recognizedLanguages: [any HybridRecognizedLanguageSpec] {
    block.recognizedLanguages.map { HybridRecognizedLanguage(language: $0) }
  }
}
