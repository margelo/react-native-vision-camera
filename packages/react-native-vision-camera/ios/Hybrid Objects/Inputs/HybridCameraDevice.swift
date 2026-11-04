///
/// HybridCameraDevice.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules

final class HybridCameraDevice: HybridCameraDeviceSpec, NativeCameraDevice {
  let device: AVCaptureDevice

  init(device: AVCaptureDevice) {
    self.device = device
  }

  lazy var supportedPixelFormats: [PixelFormat] = {
    let videoFormats = device.formats
    let depthFormats = device.formats.flatMap { $0.supportedDepthDataFormats }
    let allFormats = videoFormats + depthFormats
    return
      allFormats
      .map { PixelFormat(mediaSubType: $0.formatDescription.mediaSubType) }
      .withoutDuplicates()
  }()

  func getSupportedResolutions(outputStreamType: OutputStreamType) -> [Size] {
    let streamType = streamType(from: outputStreamType)
    return device.formats
      .flatMap { $0.supportedResolutions(for: streamType) }
      .withoutDuplicates()
      .map { Size(dimensions: $0) }
  }
  private func streamType(from outputStreamType: OutputStreamType) -> StreamType {
    switch outputStreamType {
    case .photo:
      return .photo
    case .video, .stream:
      return .video
    case .depthPhoto:
      return .depthPhoto
    case .depthStream:
      return .depthVideo
    }
  }

  lazy var supportedFPSRanges: [Range] = {
    return device.formats
      .flatMap { $0.videoSupportedFrameRateRanges }
      .withoutDuplicates()
      .map { Range(range: $0) }
  }()

  let supportsPhotoHDR: Bool = false

  lazy var supportedVideoDynamicRanges: [DynamicRange] = {
    // TODO: We create a separate struct here because for some reason the nitro-generated
    //       struct `DynamicRange` fails to build when Swift tries to link to `operator==`
    //       for `Equatable` conformance. So we use our own type, then map to the other.
    //       Remove this workaround when Apple fixes this: https://github.com/swiftlang/swift/issues/88710
    struct ImplDynamicRange: Equatable {
      let bitDepth: DynamicRangeBitDepth
      let colorSpace: ColorSpace
      let colorRange: ColorRange
      func toDynamicRange() -> DynamicRange {
        return DynamicRange(bitDepth: bitDepth, colorSpace: colorSpace, colorRange: colorRange)
      }
    }
    return device.formats
      .flatMap { format in
        return format.supportedColorSpaces.map { colorSpace in
          return ImplDynamicRange(
            bitDepth: format.bitDepth,
            colorSpace: ColorSpace(colorSpace: colorSpace),
            colorRange: format.colorRange)
        }
      }
      .withoutDuplicates()
      .map { $0.toDynamicRange() }
  }()

  func supportsOutput(output: any HybridCameraOutputSpec) throws -> Bool {
    guard let output = output as? any NativeCameraOutput else {
      // Not a NativeCameraOutput!
      return false
    }
    return device.formats.contains { $0.supportsOutput(output.output) }
  }

  func supportsFPS(fps: Double) throws -> Bool {
    return supportedFPSRanges.contains { range in
      fps >= range.min && fps <= range.max
    }
  }

  func supportsVideoStabilizationMode(videoStabilizationMode: TargetStabilizationMode) throws -> Bool {
    let stabilizationMode = videoStabilizationMode.toAVCaptureVideoStabilizationMode()
    return device.formats.contains { $0.isVideoStabilizationModeSupported(stabilizationMode) }
  }

  func supportsPreviewStabilizationMode(previewStabilizationMode: TargetStabilizationMode) throws -> Bool {
    // Video and Preview stabilization flows through the same connection on iOS.
    return try supportsVideoStabilizationMode(videoStabilizationMode: previewStabilizationMode)
  }

  var id: String {
    return device.uniqueID
  }

  var modelID: String {
    return device.modelID
  }

  var localizedName: String {
    return device.localizedName
  }

  var manufacturer: String {
    return device.manufacturer
  }

  var type: DeviceType {
    return DeviceType(type: device.deviceType)
  }

  var position: CameraPosition {
    if #available(iOS 17.0, *) {
      // On iOS, Position "external" is for some reason reflected on the .deviceType, not on .position.
      if device.deviceType == .external || device.deviceType == .continuityCamera {
        return .external
      }
    }
    return CameraPosition(position: device.position)
  }

  lazy var physicalDevices: [any HybridCameraDeviceSpec] =
    device.constituentDevices.map { HybridCameraDevice(device: $0) }

  var isVirtualDevice: Bool {
    return device.isVirtualDevice
  }

  var focalLength: Double? {
    guard #available(iOS 26.0, *) else {
      return nil
    }
    return Double(device.nominalFocalLengthIn35mmFilm)
  }

  var lensAperture: Double {
    return Double(device.lensAperture)
  }

  var isContinuityCamera: Bool {
    guard #available(iOS 16.0, *) else {
      return false
    }
    return device.isContinuityCamera
  }

  var companionDeskViewCamera: (any HybridCameraDeviceSpec)? {
    guard #available(iOS 16.0, *) else {
      return nil
    }
    guard let companion = device.companionDeskViewCamera else {
      return nil
    }
    return HybridCameraDevice(device: companion)
  }

  var supportsSmoothAutoFocus: Bool {
    return device.isSmoothAutoFocusSupported
  }

  var supportsSpeedQualityPrioritization: Bool {
    // iOS always supports QualityPrioritization.speed
    return true
  }

  var supportsExposureBias: Bool {
    return true
  }
  var minExposureBias: Double {
    return Double(device.minExposureTargetBias)
  }
  var maxExposureBias: Double {
    return Double(device.maxExposureTargetBias)
  }

  var hasFlash: Bool {
    return device.hasFlash
  }

  var hasTorch: Bool {
    return device.hasTorch
  }

  var supportsTorchStrength: Bool {
    // On iOS any device with a torch also supports custom torch level/strength
    return device.hasTorch
  }

  var minTorchStrength: Double {
    return device.minTorchStrength
  }

  var maxTorchStrength: Double {
    return device.maxTorchStrength
  }

  var supportsLowLightBoost: Bool {
    return device.isLowLightBoostSupported
  }

  var minZoom: Double {
    return device.minAvailableVideoZoomFactor
  }

  var maxZoom: Double {
    return device.maxAvailableVideoZoomFactor
  }

  var neutralZoom: Double {
    return device.neutralZoomFactor
  }

  var zoomLensSwitchFactors: [Double] {
    return device.virtualDeviceSwitchOverVideoZoomFactors.map { $0.doubleValue }
  }

  var supportsDistortionCorrection: Bool {
    return device.isGeometricDistortionCorrectionSupported
  }

  var supportsPreviewImage: Bool {
    return true
  }

  var supportsFocusMetering: Bool {
    return device.isFocusModeSupported(.autoFocus)
      || device.isFocusModeSupported(.continuousAutoFocus)
  }

  var supportsFocusLocking: Bool {
    return device.isLockingFocusWithCustomLensPositionSupported
  }

  var supportsExposureMetering: Bool {
    return device.isExposureModeSupported(.autoExpose)
      || device.isExposureModeSupported(.continuousAutoExposure)
  }

  var supportsExposureLocking: Bool {
    return device.isExposureModeSupported(.custom)
  }

  var supportsWhiteBalanceMetering: Bool {
    return device.isWhiteBalanceModeSupported(.autoWhiteBalance)
      || device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance)
  }

  var supportsWhiteBalanceLocking: Bool {
    return device.isLockingWhiteBalanceWithCustomDeviceGainsSupported
  }

  var maxWhiteBalanceGain: Double {
    return Double(device.maxWhiteBalanceGain)
  }

  var mediaTypes: [MediaType] {
    let allMediaTypes: [MediaType] = [.video, .depth, .metadata]
    return allMediaTypes.filter { device.hasMediaType($0.toAVMediaType()) }
  }

  func isSessionConfigSupported(config: any HybridCameraSessionConfigSpec) throws -> Bool {
    guard let config = config as? any NativeCameraSessionConfig else {
      // Invalid type
      return false
    }
    let format = config.negotiatedFormat.format
    guard device.formats.contains(format) else {
      // Format is from a different `AVCaptureDevice`
      return false
    }

    if let depthFormat = config.negotiatedFormat.depthFormat {
      guard format.supportedDepthDataFormats.contains(depthFormat) else {
        // Format is from a different `AVCaptureDevice.Format`
        return false
      }
    }

    // TODO: Re-use the logic from `ConstraintResolver` for resolving the actual enabled
    //       constraints (like FPS or HDR settings) so we have a single source of truth
    //       when we modify anything in the future.
    //       I guess we should be able to call `ConstraintResolver` with this given `format`
    //       and `depthFormat` (and outputs?) and check if penalty is `0`? Or some strict
    //       comparison without allowing downgrades here.

    if let targetFPS = config.enabledConstraints.selectedFPS {
      let isFPSRangeSupported = format.videoSupportedFrameRateRanges.contains { $0.contains(fps: targetFPS) }
      guard isFPSRangeSupported else {
        // FPS is not supported in Format
        return false
      }
    }

    // TODO: Add other checks here for `config.enabledConstraints`.
    //       We probably also want to compare against Outputs right?
    //       E.g. Return `false` if the `format.unsupportedCaptureOutputClasses` contains any of our Output classes.

    return true
  }
}
