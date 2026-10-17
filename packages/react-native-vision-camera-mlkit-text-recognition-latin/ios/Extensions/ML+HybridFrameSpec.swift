import MLKitVision
import NitroModules
import VisionCamera

extension HybridFrameSpec_protocol {
  func toMLImage() throws -> MLImage {
    guard let nativeFrame = self as? any NativeFrame else {
      throw RuntimeError.error(withMessage: "Frame is not of type `NativeFrame`!")
    }
    guard let sampleBuffer = nativeFrame.sampleBuffer else {
      throw RuntimeError.error(withMessage: "Frame doesn't have a CMSampleBuffer - it's invalid!")
    }
    guard let image = MLImage(sampleBuffer: sampleBuffer) else {
      throw RuntimeError.error(withMessage: "Failed to create MLImage from CMSampleBuffer!")
    }
    image.orientation = self.orientation.toUIImageOrientation(isMirrored: self.isMirrored)
    return image
  }
}
