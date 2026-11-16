///
/// AV+CameraOrientation.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules

extension CameraOrientation {
  init(avOrientation: AVCaptureVideoOrientation) {
    switch avOrientation {
    case .portrait:
      self = .up
    case .portraitUpsideDown:
      self = .down
    case .landscapeRight:
      self = .left
    case .landscapeLeft:
      self = .right
    @unknown default:
      fatalError("AVCaptureVideoOrientation has unknown value: \(avOrientation)")
    }
  }

  /**
   * The orientation of the buffers of a connection whose
   * `videoOrientation` is `reportedOrientation`.
   * See `AVCaptureConnection.bufferOrientation`.
   */
  static func bufferOrientation(
    reportedOrientation: CameraOrientation,
    isFrontCamera: Bool,
    isVideoMirrored: Bool
  ) -> CameraOrientation {
    if isFrontCamera && !isVideoMirrored {
      return reportedOrientation.inverted
    }
    return reportedOrientation
  }

  func toAVCaptureVideoOrientation() -> AVCaptureVideoOrientation {
    switch self {
    case .up:
      return .portrait
    case .down:
      return .portraitUpsideDown
    case .left:
      return .landscapeRight
    case .right:
      return .landscapeLeft
    }
  }
}
