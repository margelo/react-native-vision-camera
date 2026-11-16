///
/// HybridCameraSessionConfig.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules

final class HybridCameraSessionConfig: HybridCameraSessionConfigSpec, NativeCameraSessionConfig {
  let negotiatedFormat: NegotiatedFormat
  let enabledConstraints: EnabledConstraints

  init(negotiatedFormat: NegotiatedFormat, enabledConstraints: EnabledConstraints) {
    self.negotiatedFormat = negotiatedFormat
    self.enabledConstraints = enabledConstraints
  }

  var selectedFPS: Double? {
    return enabledConstraints.selectedFPS
  }

  var selectedVideoResolution: Size? {
    let dimensions = negotiatedFormat.format.formatDescription.dimensions
    return Size(dimensions: dimensions)
  }

  var selectedVideoStabilizationMode: TargetStabilizationMode? {
    return enabledConstraints.selectedVideoStabilizationMode
  }

  var selectedPreviewStabilizationMode: TargetStabilizationMode? {
    return enabledConstraints.selectedPreviewStabilizationMode
  }

  var selectedVideoDynamicRange: TargetDynamicRange? {
    return enabledConstraints.selectedVideoDynamicRange
  }

  var isPhotoHDREnabled: Bool {
    // Highest Photo Quality implies Smart HDR, this is not directly controllable.
    return negotiatedFormat.format.isHighestPhotoQualitySupported
  }

  var nativePixelFormat: PixelFormat {
    let format = negotiatedFormat.format
    return PixelFormat(mediaSubType: format.formatDescription.mediaSubType)
  }

  var autoFocusSystem: AutoFocusSystem {
    let format = negotiatedFormat.format
    return AutoFocusSystem(af: format.autoFocusSystem)
  }

  var isBinned: Bool {
    return negotiatedFormat.format.isVideoBinned
  }

  func toString() -> String {
    let components = [
      "format: \(negotiatedFormat.format)",
      "selectedFPS: \(String(describing: selectedFPS))",
      "selectedVideoResolution: \(String(describing: selectedVideoResolution))",
      "selectedVideoStabilizationMode: \(String(describing: selectedVideoStabilizationMode))",
      "selectedPreviewStabilizationMode: \(String(describing: selectedPreviewStabilizationMode))",
      "selectedVideoDynamicRange: \(String(describing: selectedVideoDynamicRange))",
      "isPhotoHDREnabled: \(isPhotoHDREnabled)",
    ]
    return "CameraSessionConfig(\(components.joined(separator: ", ")))"
  }
}
