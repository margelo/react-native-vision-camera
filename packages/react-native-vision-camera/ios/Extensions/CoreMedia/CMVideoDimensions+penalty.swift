///
/// CMVideoDimensions+penalty.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import CoreMedia
import Foundation

/// Maximum relative difference in aspect ratio to still be considered a "match".
private let aspectRatioTolerance = 0.02
/// Weight multiplied by the aspect ratio difference when outside `aspectRatioTolerance`.
private let aspectMismatchWeight = 100.0

extension CMVideoDimensions {
  /// The longer edge of this size (orientation-independent).
  var long: Int32 { max(width, height) }
  /// The shorter edge of this size (orientation-independent).
  var short: Int32 { min(width, height) }

  /// Computes a comparable penalty score between `self` and `target`.
  ///
  /// Primary: sizes matching the target aspect ratio (within `aspectRatioTolerance`)
  /// are always preferred. Secondary: among the same aspect-ratio group, sizes are
  /// ranked by log-ratio of pixel counts (scale-invariant — treats 2x bigger and
  /// 2x smaller as equidistant).
  func penalty(_ target: CMVideoDimensions) -> Double {
    let targetAspectRatio = Double(target.long) / Double(target.short)
    let actualAspectRatio = Double(self.long) / Double(self.short)
    let aspectRatioDiff = Swift.abs(actualAspectRatio - targetAspectRatio) / targetAspectRatio
    let aspectRatioPenalty = aspectRatioDiff < aspectRatioTolerance ? 0.0 : aspectMismatchWeight * aspectRatioDiff

    let targetPixels = Double(target.width) * Double(target.height)
    let actualPixels = Double(width) * Double(height)
    // Weight pixel-distance on the same scale as the aspect term so the
    // requested resolution stays a first-class signal. The raw log-ratio
    // (~0–1.4) is otherwise far weaker than the FPS penalty (raw frame units,
    // up to 30), so requesting a high FPS silently escalates the recording
    // resolution well past `targetResolution` (e.g. a front-camera 1080p@60
    // request lands on 4K@60 even though a native 1080p@60 format exists).
    let logPixelDistance = aspectMismatchWeight * Swift.abs(log(actualPixels / targetPixels))

    return aspectRatioPenalty + logPixelDistance
  }

  /// Computes a comparable penalty score for using `self` when at least
  /// `minimum` pixels are desired in both dimensions.
  ///
  /// Any size covering `minimum` entirely (`>=` in both dimensions) is a
  /// perfect match (`0.0`) — a minimum rule does not care how much larger
  /// a size is. A smaller size is penalized by the factor it needs to be
  /// upscaled with to cover `minimum` (aspect-fill), on the same logarithmic
  /// pixel-count scale as `penalty(_:)`. Aspect ratio is irrelevant here,
  /// as any size covering `minimum` can simply be center-cropped to it.
  func penalty(coveringAtLeast minimum: CMVideoDimensions) -> Double {
    let requiredUpscaleFactor = Swift.max(
      Double(minimum.long) / Double(self.long),
      Double(minimum.short) / Double(self.short),
      1.0)
    // The upscale factor applies to both dimensions, so the pixel-count deficit is its square.
    return log(requiredUpscaleFactor * requiredUpscaleFactor)
  }
}

extension Array where Element == CMVideoDimensions {
  func nearest(to target: CMVideoDimensions) -> CMVideoDimensions? {
    return self.min { left, right in
      left.penalty(target) < right.penalty(target)
    }
  }
}
