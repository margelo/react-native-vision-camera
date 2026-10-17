import MLKitVision
import NitroImage
import NitroModules

extension HybridImageSpec_protocol {
  func toMLImage() throws -> MLImage {
    guard let nativeImage = self as? any NativeImage else {
      throw RuntimeError.error(withMessage: "Image is not of type `NativeImage`!")
    }
    guard let image = MLImage(image: nativeImage.uiImage) else {
      throw RuntimeError.error(withMessage: "Failed to create MLImage from Image!")
    }
    return image
  }
}
