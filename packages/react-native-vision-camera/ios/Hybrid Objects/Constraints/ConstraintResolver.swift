///
/// ConstraintResolver.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules

// TODO: A streaming output's (like a Frame Output) pixel format should participate
//       in format negotiations - e.g. when it's configured to `'yuv'` we should prefer
//       .yuv4208BiVideo formats. When it's `'native'`, we shouldn't care. Like .any

enum ConstraintResolver {
  static func resolveConstraints(
    for device: CameraDeviceOrPosition,
    constraints: [Constraint],
    outputs: [any HybridCameraOutputSpec],
    isMultiCam: Bool
  ) throws -> ResolvedConstraints {
    let device = try AVCaptureDevice.resolve(value: device)
    return try resolveConstraints(
      for: device,
      constraints: constraints,
      outputs: outputs,
      isMultiCam: isMultiCam)
  }

  static func resolveConstraints(
    for device: any HybridCameraDeviceSpec,
    constraints: [Constraint],
    outputs: [any HybridCameraOutputSpec],
    isMultiCam: Bool
  ) throws -> ResolvedConstraints {
    guard let device = device as? any NativeCameraDevice else {
      throw RuntimeError("The given `device` is not of type `NativeCameraDevice`!")
    }
    return try resolveConstraints(
      for: device.device,
      constraints: constraints,
      outputs: outputs,
      isMultiCam: isMultiCam)
  }

  static func resolveConstraints(
    for device: AVCaptureDevice,
    constraints: [Constraint],
    outputs: [any HybridCameraOutputSpec],
    isMultiCam: Bool
  ) throws -> ResolvedConstraints {
    let outputs = try outputs.compactMap { output in
      switch output {
      case let output as any NativeCameraOutput:
        return output
      case is any NativePreviewViewOutput:
        return nil
      default:
        throw RuntimeError.error(
          withMessage:
            "Connection output \"\(output)\" is not of type `NativeCameraOutput` or `NativePreviewViewOutput`!"
        )
      }
    }
    return try resolveConstraints(
      for: device,
      constraints: constraints,
      outputs: outputs,
      isMultiCam: isMultiCam)
  }

  static func resolveConstraints(
    for device: AVCaptureDevice,
    constraints userConstraints: [Constraint],
    outputs: [any NativeCameraOutput],
    isMultiCam: Bool
  ) throws -> ResolvedConstraints {
    // Build the full constraint list: user constraints first (highest priority),
    // then inferred internal constraints (lowest priority).
    var constraints: [InternalConstraint] = userConstraints.map { .userConstraint($0) }
    constraints.append(.preferredAutoFocusSystem(.phaseDetection))
    if outputs.contains(where: { $0.streamType == .photo }) {
      constraints.append(.preferHighQualityPrioritization)
      constraints.append(.preferHighestPhotoQuality)
    }

    // Hard requirements: filter out formats that are not possible at all.
    let formats = try filterFormats(device.formats, outputs: outputs, isMultiCam: isMultiCam)

    // Evaluate all formats and pick the one with the best penalty vector.
    // Constraints are ordered by priority, so we compare penalties lexicographically
    // instead of summing heterogeneous units (fps deltas, pixel distances,
    // fallback steps, ...). This makes a higher-priority constraint impossible
    // to swamp numerically with a lower-priority one.
    // This is a single pass - format selection and enabled constraints
    // are computed together from the same resolve() calls.
    guard
      let best =
        try formats
        .map({ try evaluate($0, constraints: constraints) })
        .min(by: { $0.isBetterMatch(than: $1) })
    else {
      throw RuntimeError.error(withMessage: "The given `device` does not have any `formats`!")
    }
    logger.debug("Selected Format: \(best.format)")

    // If we need depth data, also find the best depth format
    let needsDepth = outputs.contains { $0.requiresDepthFormat }
    // TODO: Don't just choose the first format, but also negotiate depth data format in our constraint resolution.
    let bestDepthFormat = needsDepth ? best.format.supportedDepthDataFormats.first : nil

    return ResolvedConstraints(
      device: device,
      negotiatedFormat: NegotiatedFormat(format: best.format, depthFormat: bestDepthFormat),
      enabledConstraints: best.enabledConstraints)
  }

  // MARK: - Format Evaluation

  /// Evaluates all constraints against a single format in one pass.
  /// Returns the format, its ordered penalties, and the enabled constraints
  /// that would apply if this format is selected.
  private static func evaluate(
    _ format: AVCaptureDevice.Format,
    constraints: [InternalConstraint]
  ) throws(RuntimeError) -> FormatEvaluation {
    var penalties: [ConstraintPenalty] = []

    // First-match-wins accumulators (priority order = array order)
    var fps: Double?
    var videoStabilizationMode: TargetStabilizationMode?
    var previewStabilizationMode: TargetStabilizationMode?
    var videoDynamicRange: TargetDynamicRange?

    for constraint in constraints {
      let evaluation = try constraint.evaluate(for: format)
      penalties.append(evaluation.penalty)

      // Accumulate enabled values - first of each type wins (= highest priority)
      switch evaluation.resolved {
      case .fps(let value):
        if fps == nil { fps = value }
      case .videoStabilizationMode(let value):
        if videoStabilizationMode == nil { videoStabilizationMode = value }
      case .previewStabilizationMode(let value):
        if previewStabilizationMode == nil { previewStabilizationMode = value }
      case .videoDynamicRange(let value):
        if videoDynamicRange == nil { videoDynamicRange = value }
      case .formatOnly:
        break
      }
    }

    let enabledConstraints = EnabledConstraints(
      selectedFPS: fps,
      selectedVideoStabilizationMode: videoStabilizationMode,
      selectedPreviewStabilizationMode: previewStabilizationMode,
      selectedVideoDynamicRange: videoDynamicRange)

    return FormatEvaluation(
      format: format,
      penalties: penalties,
      enabledConstraints: enabledConstraints)
  }

  // MARK: - Hard Filters

  /// Filters out formats that we cannot support at all.
  /// These are hard requirements, not soft constraints/biases.
  private static func filterFormats(
    _ formats: [AVCaptureDevice.Format],
    outputs: [any NativeCameraOutput],
    isMultiCam: Bool
  ) throws(RuntimeError) -> [AVCaptureDevice.Format] {
    var formats = formats
    guard !formats.isEmpty else {
      throw RuntimeError.error(withMessage: "The given `device` does not have any `formats`!")
    }

    // 1. If we need a Depth Output, filter out formats without depth support
    let needsDepth = outputs.contains { $0.requiresDepthFormat }
    if needsDepth {
      formats = formats.filter { !$0.supportedDepthDataFormats.isEmpty }
      guard !formats.isEmpty else {
        throw RuntimeError.error(
          withMessage:
            "The given `device` does not have any `formats` that have `supportedDepthDataFormats`. Does this device support depth?"
        )
      }
    }

    // 2. If multi-cam, ensure formats support it
    if isMultiCam {
      formats = formats.filter { $0.isMultiCamSupported }
      guard !formats.isEmpty else {
        throw RuntimeError.error(
          withMessage:
            "The given `device` does not have any `formats` that support multi-cam sessions! Does this `device` support multi-cam?"
        )
      }
    }

    // 3. Ensure formats support all target outputs
    formats = formats.filter { format in
      outputs.allSatisfy { format.supportsOutput($0.output) }
    }
    guard !formats.isEmpty else {
      throw RuntimeError.error(
        withMessage:
          "The given `device` does not have any `formats` that support the attached Outputs!")
    }

    return formats
  }
}

/// Type-erased resolved value, so we can accumulate heterogeneous constraint
/// results into a single `EnabledConstraints`.
enum ResolvedConstraintValue {
  case fps(Double)
  case videoStabilizationMode(TargetStabilizationMode)
  case previewStabilizationMode(TargetStabilizationMode)
  case videoDynamicRange(TargetDynamicRange)
  /// Constraint only affects format selection, not enabled settings
  case formatOnly
}

/// A constraint evaluation result: penalty + type-erased resolved value.
struct ConstraintEvaluation {
  let penalty: ConstraintPenalty
  let resolved: ResolvedConstraintValue
}

/// Result of evaluating all constraints against a single format.
struct FormatEvaluation {
  let format: AVCaptureDevice.Format
  let penalties: [ConstraintPenalty]
  let enabledConstraints: EnabledConstraints

  func isBetterMatch(than other: FormatEvaluation) -> Bool {
    for (left, right) in zip(penalties, other.penalties) {
      if left == right { continue }
      return left < right
    }
    return false
  }
}

// MARK: - Constraint / InternalConstraint Dispatchers

extension Constraint {
  func evaluate(for format: AVCaptureDevice.Format) throws(RuntimeError) -> ConstraintEvaluation {
    switch self {
    case .first(let fpsConstraint):
      let r = fpsConstraint.resolve(for: format)
      return ConstraintEvaluation(penalty: r.penalty, resolved: .fps(r.resolvedValue))
    case .second(let videoStab):
      let r = videoStab.resolve(for: format)
      return ConstraintEvaluation(penalty: r.penalty, resolved: .videoStabilizationMode(r.resolvedValue))
    case .third(let previewStab):
      let r = previewStab.resolve(for: format)
      return ConstraintEvaluation(penalty: r.penalty, resolved: .previewStabilizationMode(r.resolvedValue))
    case .fourth(let resolutionBias):
      let r = try resolutionBias.resolve(for: format)
      return ConstraintEvaluation(penalty: r.penalty, resolved: .formatOnly)
    case .fifth(let dynamicRange):
      let r = dynamicRange.resolve(for: format)
      return ConstraintEvaluation(penalty: r.penalty, resolved: .videoDynamicRange(r.resolvedValue))
    case .sixth(_):
      // Photo HDR is not supported on iOS.
      return ConstraintEvaluation(penalty: .noPenalty, resolved: .formatOnly)
    case .seventh(let pixelFormat):
      let r = pixelFormat.resolve(for: format)
      return ConstraintEvaluation(penalty: r.penalty, resolved: .formatOnly)
    case .eigth(let binned):
      let r = binned.resolve(for: format)
      return ConstraintEvaluation(penalty: r.penalty, resolved: .formatOnly)
    }
  }
}

extension InternalConstraint {
  func evaluate(for format: AVCaptureDevice.Format) throws(RuntimeError) -> ConstraintEvaluation {
    switch self {
    case .userConstraint(let constraint):
      return try constraint.evaluate(for: format)
    case .preferredAutoFocusSystem(let afSystem):
      let r = afSystem.resolve(for: format)
      return ConstraintEvaluation(penalty: r.penalty, resolved: .formatOnly)
    case .preferHighestPhotoQuality:
      let penalty = format.isHighestPhotoQualitySupported ? 0.0 : 1.0
      return ConstraintEvaluation(
        penalty: ConstraintPenalty(distance: penalty),
        resolved: .formatOnly)
    case .preferHighQualityPrioritization:
      let penalty = format.isHighPhotoQualitySupported ? 0.0 : 1.0
      return ConstraintEvaluation(
        penalty: ConstraintPenalty(distance: penalty),
        resolved: .formatOnly)
    }
  }
}
