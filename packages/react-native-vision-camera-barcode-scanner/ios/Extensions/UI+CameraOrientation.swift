///
/// UI+CameraOrientation.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import UIKit
import VisionCamera

extension CameraOrientation {
  /**
   * Converts this `CameraOrientation` (where the content's top is, rotated
   * before mirroring) to the `UIImage.Orientation` that displays it (which
   * mirrors before rotating): un-mirrored quarter turns swap names, e.g. a
   * portrait back camera buffer (`.left`) is `UIImage.Orientation.right`.
   */
  func toUIImageOrientation(isMirrored: Bool = false) -> UIImage.Orientation {
    switch self {
    case .up:
      return isMirrored ? .upMirrored : .up
    case .down:
      return isMirrored ? .downMirrored : .down
    case .left:
      return isMirrored ? .leftMirrored : .right
    case .right:
      return isMirrored ? .rightMirrored : .left
    }
  }
}
