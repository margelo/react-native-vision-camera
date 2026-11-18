///
/// UI+CameraOrientation.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import UIKit
import VisionCamera

extension CameraOrientation {
  func toUIImageOrientation(isMirrored: Bool = false) -> UIImage.Orientation {
    switch self {
    case .up:
      return isMirrored ? .upMirrored : .up
    case .down:
      return isMirrored ? .downMirrored : .down
    case .left:
      return isMirrored ? .rightMirrored : .right
    case .right:
      return isMirrored ? .leftMirrored : .left
    }
  }
}
