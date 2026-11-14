///
/// HybridCameraPreviewOutput.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules

final class HybridCameraPreviewOutput: HybridCameraPreviewOutputSpec, NativePreviewViewOutput {
  let mediaType: MediaType = .video
  let previewLayer: AVCaptureVideoPreviewLayer
  private let orientationManager = HybridInterfaceOrientationManager()
  var outputOrientation: CameraOrientation {
    get {
      return previewLayer.connection?.orientation ?? .up
    }
    set {
      // Setting orientation on a Preview output does nothing,
      // as its orientation is always driven by the `orientationManager`.
    }
  }
  var currentResolution: Size? {
    guard let connection = previewLayer.connection else { return nil }
    return connection.inputStreamResolution
  }

  var streamType: StreamType = .video
  /// The Preview can never display more pixels than the screen has,
  /// so any Format at least as large as the screen (`>=`) is a perfect
  /// match - hence `.min`. This is only a _bias_; a slightly smaller
  /// Format only gets a small penalty (it is upscaled on-screen), so
  /// other outputs (e.g. a video recording with an explicit
  /// `targetResolution`) can still win the resolution negotiation.
  ///
  /// We use the screen size instead of the actual view size here
  /// because the view might not even be laid out yet at the time
  /// the resolution negotiation runs.
  var targetResolution: ResolutionRule {
    let screenSizeDp = UIScreen.main.bounds.size
    let pixelRatio = UIScreen.main.scale
    let screenSizePx = Size(
      width: screenSizeDp.width * pixelRatio,
      height: screenSizeDp.height * pixelRatio)
    return .min(screenSizePx)
  }

  override init() {
    self.previewLayer = AVCaptureVideoPreviewLayer()
    self.previewLayer.videoGravity = .resizeAspectFill
    super.init()
    self.orientationManager.startOrientationUpdates { [weak self] orientation in
      guard let self else { return }
      if let connection = self.previewLayer.connection {
        try? connection.setOrientation(orientation)
      }
    }
  }

  deinit {
    orientationManager.stopOrientationUpdates()
  }

  func configure(config: OutputConfiguration) {
    guard let connection = previewLayer.connection else {
      return
    }
    try? connection.setMirrorMode(config.mirrorMode)
    if let interfaceOrientation = orientationManager.currentOrientation {
      try? connection.setOrientation(interfaceOrientation)
    } else {
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        guard let connection = self.previewLayer.connection else { return }
        if let interfaceOrientation = self.orientationManager.currentOrientation {
          try? connection.setOrientation(interfaceOrientation)
        }
      }
    }
  }
}
