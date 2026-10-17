import MLKitTextRecognition
import MLKitVision
import NitroImage
import NitroModules
import VisionCamera

final class HybridTextRecognizer: HybridTextRecognizerSpec {
  private let recognizer = TextRecognizer.textRecognizer(options: TextRecognizerOptions())

  func recognizeText(frame: any HybridFrameSpec) throws -> any HybridRecognizedTextSpec {
    let image = try frame.toMLImage()
    return HybridRecognizedText(result: try recognizer.results(in: image))
  }

  func recognizeTextAsync(frame: any HybridFrameSpec) throws -> Promise<any HybridRecognizedTextSpec> {
    return process(try frame.toMLImage())
  }

  func recognizeTextInImage(image: any HybridImageSpec) throws -> any HybridRecognizedTextSpec {
    return HybridRecognizedText(result: try recognizer.results(in: image.toMLImage()))
  }

  func recognizeTextInImageAsync(image: any HybridImageSpec) throws -> Promise<any HybridRecognizedTextSpec> {
    return process(try image.toMLImage())
  }

  private func process(_ image: MLImage) -> Promise<any HybridRecognizedTextSpec> {
    let promise = Promise<any HybridRecognizedTextSpec>()
    recognizer.process(image) { result, error in
      if let error {
        promise.reject(withError: error)
      } else if let result {
        promise.resolve(withResult: HybridRecognizedText(result: result))
      } else {
        promise.reject(withError: RuntimeError.error(withMessage: "ML Kit returned neither text nor an error."))
      }
    }
    return promise
  }
}
