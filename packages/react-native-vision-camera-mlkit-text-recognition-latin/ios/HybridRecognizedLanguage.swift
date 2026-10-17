import MLKitTextRecognitionCommon

final class HybridRecognizedLanguage: HybridRecognizedLanguageSpec {
  private let language: TextRecognizedLanguage

  init(language: TextRecognizedLanguage) {
    self.language = language
    super.init()
  }

  var languageCode: String? { language.languageCode }
}
