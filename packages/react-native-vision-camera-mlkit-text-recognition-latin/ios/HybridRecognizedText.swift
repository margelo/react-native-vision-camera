import MLKitTextRecognitionCommon

final class HybridRecognizedText: HybridRecognizedTextSpec {
  private let result: Text

  init(result: Text) {
    self.result = result
    super.init()
  }

  var text: String { result.text }
  var blocks: [any HybridTextBlockSpec] {
    result.blocks.map { HybridTextBlock(block: $0) }
  }
}
