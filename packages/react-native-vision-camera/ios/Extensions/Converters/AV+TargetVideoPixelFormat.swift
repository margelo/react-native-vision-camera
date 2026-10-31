///
/// AutoFocusSystem+TargetVideoPixelFormat.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules

extension TargetVideoPixelFormat {
  func toCVPixelFormatType() -> TargetCVPixelFormat {
    switch self {
    case .native:
      return .native
    case .yuv:
      return .specific(kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange)
    case .rgb:
      return .specific(kCVPixelFormatType_32BGRA)
    }
  }
}
