///
/// AVCaptureConnection+orientation.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules

extension AVCaptureConnection {
  var orientation: CameraOrientation {
    return CameraOrientation(avOrientation: videoOrientation)
  }

  var physicalBufferRotation: CameraOrientation {
    #if os(iOS)
      if #available(iOS 17.0, *) {
        return CameraOrientation(degrees: Int(videoRotationAngle))
      }
    #endif
    // videoRotationAngle is unavailable before iOS 17 and on visionOS.
    // Preserve the existing videoOrientation-based behavior on those targets.
    return orientation
  }

  func setOrientation(_ orientation: CameraOrientation) throws {
    guard self.isVideoOrientationSupported else {
      throw RuntimeError.error(
        withMessage:
          "Cannot set orientation=\"\(orientation.stringValue)\" - this connection does not support orientation changing"
      )
    }
    self.videoOrientation = orientation.toAVCaptureVideoOrientation()
  }
}
