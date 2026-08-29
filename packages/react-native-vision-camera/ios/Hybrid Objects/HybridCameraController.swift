///
/// HybridCameraController.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules

final class HybridCameraController: HybridCameraControllerSpec, NativeCameraController {
  let device: any HybridCameraDeviceSpec
  let queue: DispatchQueue
  let captureDevice: AVCaptureDevice
  private var activeMeteringTask: MeteringTask? = nil

  init(device: any HybridCameraDeviceSpec & NativeCameraDevice, queue: DispatchQueue) throws {
    self.device = device
    self.captureDevice = device.device

    // TODO: Is it best practice to use the same `queue` as our HybridCameraSession?
    self.queue = queue
  }

  var isConnected: Bool {
    return captureDevice.isConnected
  }

  var isSuspended: Bool {
    return captureDevice.isSuspended
  }

  var isUsedByAnotherApp: Bool {
    #if os(macOS)
      return captureDevice.isInUseByAnotherApplication
    #else
      return false
    #endif
  }

  var focusMode: FocusMode {
    return FocusMode(mode: captureDevice.focusMode)
  }

  var exposureMode: ExposureMode {
    return ExposureMode(mode: captureDevice.exposureMode)
  }

  var whiteBalanceMode: WhiteBalanceMode {
    return WhiteBalanceMode(mode: captureDevice.whiteBalanceMode)
  }

  var whiteBalanceGains: WhiteBalanceGains {
    let gains = captureDevice.deviceWhiteBalanceGains
    return WhiteBalanceGains(
      redGain: Double(gains.redGain),
      blueGain: Double(gains.blueGain),
      greenGain: Double(gains.greenGain))
  }

  var isLowLightBoostEnabled: Bool {
    return captureDevice.automaticallyEnablesLowLightBoostWhenAvailable
  }

  var isSmoothAutoFocusEnabled: Bool {
    return captureDevice.isSmoothAutoFocusEnabled
  }

  var isDistortionCorrectionEnabled: Bool {
    return captureDevice.isGeometricDistortionCorrectionEnabled
  }

  var zoom: Double {
    return captureDevice.videoZoomFactor
  }

  var minZoom: Double {
    return captureDevice.minAvailableVideoZoomFactor
  }

  var maxZoom: Double {
    return captureDevice.maxAvailableVideoZoomFactor
  }

  var displayableZoomFactor: Double {
    guard #available(iOS 18.0, *) else {
      return zoom
    }
    return zoom * captureDevice.displayVideoZoomFactorMultiplier
  }

  var torchStrength: Double {
    return Double(captureDevice.torchLevel)
  }

  var torchMode: TorchMode {
    return TorchMode(mode: captureDevice.torchMode)
  }

  var lensPosition: Double {
    return Double(captureDevice.lensPosition)
  }

  var exposureDuration: Double {
    return captureDevice.exposureDuration.seconds
  }

  var activeMaxExposureDuration: Double {
    return captureDevice.activeMaxExposureDuration.seconds
  }

  var exposureBias: Double {
    return Double(captureDevice.exposureTargetBias)
  }

  var iso: Double {
    return Double(captureDevice.iso)
  }

  func configure(config: CameraControllerConfiguration) -> Promise<Void> {
    return captureDevice.withLock(queue) {
      let device = self.captureDevice

      // `enableLowLightBoost={...}`
      if let enableLowLightBoost = config.enableLowLightBoost {
        guard device.isLowLightBoostSupported else {
          throw RuntimeError.error(
            withMessage: "This CameraDevice does not support `enableLowLightBoost`!")
        }
        device.automaticallyEnablesLowLightBoostWhenAvailable = enableLowLightBoost
      }

      // `enableSmoothAutoFocus={...}`
      if let enableSmoothAutoFocus = config.enableSmoothAutoFocus {
        guard device.isSmoothAutoFocusSupported else {
          throw RuntimeError.error(
            withMessage: "This CameraDevice does not support `enableSmoothAutoFocus`!")
        }
        device.isSmoothAutoFocusEnabled = enableSmoothAutoFocus
      }

      // `enableDistortionCorrection={...}`
      if let enableDistortionCorrection = config.enableDistortionCorrection {
        guard device.isGeometricDistortionCorrectionSupported else {
          throw RuntimeError.error(
            withMessage: "This CameraDevice does not support `enableDistortionCorrection`!")
        }
        device.isGeometricDistortionCorrectionEnabled = enableDistortionCorrection
      }
    }
  }

  func setZoom(zoom: Double) -> Promise<Void> {
    return captureDevice.withLock(queue) {
      // 1. Ensure zoom is within valid range
      let device = self.captureDevice
      guard zoom >= device.minAvailableVideoZoomFactor && zoom <= device.maxAvailableVideoZoomFactor
      else {
        throw RuntimeError.error(
          withMessage:
            "`zoom` is not within the device's `minZoom` and `maxZoom` range! (Received: \(zoom), `device.minZoom`: \(device.minAvailableVideoZoomFactor), `device.maxZoom`: \(device.maxAvailableVideoZoomFactor)"
        )
      }
      // 2. Clamp zoom to the active format's max zoom (might be slightly smaller than device max zoom)
      let clampedForFormat = min(zoom, device.activeFormat.videoMaxZoomFactor)
      // 3. Apply zoom
      device.videoZoomFactor = clampedForFormat
    }
  }

  func focusTo(
    point: any HybridMeteringPointSpec,
    options: FocusOptions
  ) -> Promise<Void> {
    return captureDevice.withLock(queue) { resolve, reject in
      guard let point = point as? HybridMeteringPoint else {
        throw RuntimeError.error(withMessage: "MeteringPoint is not of type `HybridMeteringPoint`!")
      }
      let responsiveness = options.responsiveness ?? .snappy
      let adaptiveness = options.adaptiveness ?? .continuous
      let autoResetAfter = options.autoResetAfter ?? Variant_NullType_Double.second(5.0)
      let modes = options.modes ?? self.getAllSupportedMeteringModes()
      guard !modes.isEmpty else {
        throw RuntimeError.error(withMessage: "MeteringModes cannot be empty!")
      }

      // Cancel any previous tasks
      self.activeMeteringTask?.cancel()
      self.activeMeteringTask = nil

      // Create a new MeteringTask and start the desired metering operations
      let task = MeteringTask(
        device: self.captureDevice,
        adaptiveness: adaptiveness,
        autoReset: autoResetAfter.toAutoReset(),
        on: self.queue)
      // AE
      if modes.contains(.ae) {
        try task.startMeteringAE(
          to: point.toNormalizedPoint(),
          responsiveness: responsiveness)
      }
      // AF
      if modes.contains(.af) {
        try task.startMeteringAF(
          to: point.toNormalizedPoint(),
          responsiveness: responsiveness)
      }
      // AWB
      if modes.contains(.awb) {
        try task.startMeteringAWB(responsiveness: responsiveness)
      }

      // Start listening to updates
      task.startListening(
        onComplete: resolve,
        onError: reject
      )
      self.activeMeteringTask = task

    }
  }

  /**
   * Get a list of all [MeteringMode]s that are supported on this device.
   */
  private func getAllSupportedMeteringModes() -> [MeteringMode] {
    var modes: [MeteringMode] = []
    if isExposureMeteringSupported {
      modes.append(.ae)
    }
    if isFocusMeteringSupported {
      modes.append(.af)
    }
    // White Balance adjusting is not point-based, but it still requires a supported auto mode.
    if captureDevice.isWhiteBalanceModeSupported(.autoWhiteBalance) || captureDevice.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
      modes.append(.awb)
    }
    return modes
  }

  func resetFocus() -> Promise<Void> {
    return captureDevice.withLock(queue) {
      // cancel an ongoing focus operation
      self.activeMeteringTask?.cancel()
      self.activeMeteringTask = nil

      logger.info("Resetting focus...")
      let device = self.captureDevice
      // reset AF to center + continuous tracking
      if device.isFocusPointOfInterestSupported {
        device.focusPointOfInterest = CGPoint(x: 0.5, y: 0.5)
      }
      if let mode = getResetFocusMode(for: device) {
        device.focusMode = mode
      }
      // reset AE to center + continuous tracking
      if device.isExposurePointOfInterestSupported {
        device.exposurePointOfInterest = CGPoint(x: 0.5, y: 0.5)
      }
      if let mode = getResetExposureMode(for: device) {
        device.exposureMode = mode
      }
      // reset AWB to continuous tracking
      if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
        device.whiteBalanceMode = .continuousAutoWhiteBalance
      }
    }
  }

  private var isExposureMeteringSupported: Bool {
    return captureDevice.isExposurePointOfInterestSupported
      && (captureDevice.isExposureModeSupported(.autoExpose) || captureDevice.isExposureModeSupported(.continuousAutoExposure))
  }

  private var isFocusMeteringSupported: Bool {
    return captureDevice.isFocusPointOfInterestSupported
      && (captureDevice.isFocusModeSupported(.autoFocus) || captureDevice.isFocusModeSupported(.continuousAutoFocus))
  }

  private func getResetFocusMode(for device: AVCaptureDevice) -> AVCaptureDevice.FocusMode? {
    if device.isFocusModeSupported(.continuousAutoFocus) {
      return .continuousAutoFocus
    } else if device.isFocusModeSupported(.autoFocus) {
      return .autoFocus
    } else {
      return nil
    }
  }

  private func getResetExposureMode(for device: AVCaptureDevice) -> AVCaptureDevice.ExposureMode? {
    if device.isExposureModeSupported(.continuousAutoExposure) {
      return .continuousAutoExposure
    } else if device.isExposureModeSupported(.autoExpose) {
      return .autoExpose
    } else {
      return nil
    }
  }

  func addSubjectAreaChangedListener(onSubjectAreaChanged: @escaping () -> Void) -> ListenerSubscription {
    return SubjectAreaMonitor.addObserver(
      device: captureDevice,
      onSubjectAreaDidChange: onSubjectAreaChanged)
  }

  func setTorchMode(mode: TorchMode) -> Promise<Void> {
    return captureDevice.withLock(queue) {
      // 1. Ensure we have a torch
      if !self.captureDevice.hasTorch {
        if mode == .off {
          // We set it to off, we can ignore that we don't have a torch.
          return
        }
        throw RuntimeError.error(
          withMessage:
            "Tried setting torch mode to `\(mode.stringValue)`, but the device does not have a `torch`!"
        )
      }

      // 2. Set mode to on or off
      switch mode {
      case .off:
        self.captureDevice.torchMode = .off
      case .on:
        self.captureDevice.torchMode = .on
      }
    }
  }

  func enableTorchWithStrength(strength: Double) -> Promise<Void> {
    return captureDevice.withLock(queue) {
      guard self.device.supportsTorchStrength else {
        throw RuntimeError.error(
          withMessage: "Cannot enable torch - this CameraDevice does not support setting torch strength! (See `device.supportsTorchStrength`)"
        )
      }
      let minStrength = self.captureDevice.minTorchStrength
      let maxStrength = self.captureDevice.maxTorchStrength
      guard strength >= minStrength && strength <= maxStrength else {
        throw RuntimeError(
          "`strength` is not within the device's `minTorchStrength` and `maxTorchStrength` range! (Received: \(strength), `device.minTorchStrength`: \(minStrength), `device.maxTorchStrength`: \(maxStrength)"
        )
      }
      try self.captureDevice.setTorchModeOn(level: Float(strength))
    }
  }

  func startZoomAnimation(zoom: Double, rate: Double) -> Promise<Void> {
    return captureDevice.withLock(queue) { completion in
      if self.captureDevice.videoZoomFactor == zoom {
        // We are already exactly on our target value
        completion()
        return
      }

      var observation: NSKeyValueObservation?
      observation = self.captureDevice.observe(
        \.isRampingVideoZoom,
        options: [.old, .new],
        changeHandler: { _, change in
          if change.oldValue == true && change.newValue == false {
            completion()
            observation?.invalidate()
          }
        })

      self.captureDevice.ramp(toVideoZoomFactor: zoom, withRate: Float(rate))
    }
  }

  func cancelZoomAnimation() -> Promise<Void> {
    return captureDevice.withLock(queue) {
      self.captureDevice.cancelVideoZoomRamp()
    }
  }

  func setExposureBias(exposure: Double) -> Promise<Void> {
    return captureDevice.withLock(queue) { completion in
      // 1. Ensure exposureBias is within range
      let device = self.captureDevice
      let exposure = Float(exposure)
      guard exposure >= device.minExposureTargetBias && exposure <= device.maxExposureTargetBias else {
        throw RuntimeError(
          "`exposure` is not within the device's `minExposureBias` and `maxExposureBias` range! (Received: \(exposure), `device.minExposureBias`: \(device.minExposureTargetBias), `device.maxExposureBias`: \(device.maxExposureTargetBias)"
        )
      }

      // 2. Set Exposure Bias
      device.setExposureTargetBias(Float(exposure)) { _ in
        // 3. Once exposure is set, resolve the Promise
        completion()
      }
    }
  }

  func setFocusLocked(lensPosition: Double) -> Promise<Void> {
    return captureDevice.withLock(queue) { completion in
      // 1. Ensure values are within valid range
      guard self.captureDevice.isLockingFocusWithCustomLensPositionSupported else {
        throw RuntimeError.error(
          withMessage: "Cannot lock focus - this CameraDevice does not support locking focus to a custom lens position! (See `device.supportsFocusLocking`)")
      }
      guard lensPosition >= 0 && lensPosition <= 1 else {
        throw RuntimeError.error(
          withMessage: "`lensPosition` is not within 0.0 to 1.0 range! (Received: \(lensPosition))")
      }

      // 2. Lock Focus
      self.captureDevice.setFocusModeLocked(lensPosition: Float(lensPosition)) { _ in
        // 3. Once it locked, resolve the Promise
        completion()
      }
    }
  }

  func lockCurrentFocus() -> Promise<Void> {
    return captureDevice.withLock(queue) { completion in
      guard self.captureDevice.isLockingFocusWithCustomLensPositionSupported else {
        throw RuntimeError.error(
          withMessage: "Cannot lock focus - this CameraDevice does not support locking focus to a custom lens position! (See `device.supportsFocusLocking`)")
      }
      self.captureDevice.setFocusModeLocked(lensPosition: AVCaptureDevice.currentLensPosition) {
        _ in
        completion()
      }
    }
  }

  var minExposureDuration: Double {
    return captureDevice.activeFormat.minExposureDuration.seconds
  }

  var maxExposureDuration: Double {
    return captureDevice.activeFormat.maxExposureDuration.seconds
  }

  var minISO: Double {
    return Double(captureDevice.activeFormat.minISO)
  }

  var maxISO: Double {
    return Double(captureDevice.activeFormat.maxISO)
  }

  func setExposureLocked(duration: Double, iso: Double) -> Promise<Void> {
    return captureDevice.withLock(queue) { completion in
      let device = self.captureDevice
      // 1. Ensure values are within valid range
      guard device.isExposureModeSupported(.custom) else {
        throw RuntimeError.error(
          withMessage: "Cannot lock exposure - this CameraDevice does not support custom exposure duration/ISO! (See `device.supportsExposureLocking`)")
      }
      guard
        duration >= device.activeFormat.minExposureDuration.seconds
          && duration <= device.activeFormat.maxExposureDuration.seconds
      else {
        throw RuntimeError.error(
          withMessage:
            "`duration` is not within the currently selected Format's `minExposureDuration` and `maxExposureDuration` range! (Received: \(duration), `activeFormat.minExposureDuration`: \(device.activeFormat.minExposureDuration.seconds), `activeFormat.maxExposureDuration`: \(device.activeFormat.maxExposureDuration.seconds)"
        )
      }
      let iso = Float(iso)
      guard iso >= device.activeFormat.minISO && iso <= device.activeFormat.maxISO else {
        throw RuntimeError.error(
          withMessage:
            "`iso` is not within the currently selected Format's `minISO` and `maxISO` range! (Received: \(iso), `activeFormat.minISO`: \(device.activeFormat.minISO), `activeFormat.maxISO`: \(device.activeFormat.maxISO)"
        )
      }

      // 2. Set the Exposure Duration/ISO
      let time = CMTime(seconds: duration, preferredTimescale: 1_000_000)
      device.setExposureModeCustom(duration: time, iso: iso) { _ in
        // 3. Once exposure is set, resolve the Promise
        completion()
      }
    }
  }

  func lockCurrentExposure() -> Promise<Void> {
    return captureDevice.withLock(queue) { completion in
      guard self.captureDevice.isExposureModeSupported(.custom) else {
        throw RuntimeError.error(
          withMessage: "Cannot lock exposure - this CameraDevice does not support custom exposure duration/ISO! (See `device.supportsExposureLocking`)")
      }
      self.captureDevice.setExposureModeCustom(
        duration: AVCaptureDevice.currentExposureDuration,
        iso: AVCaptureDevice.currentISO
      ) { _ in
        completion()
      }
    }
  }

  func convertWhiteBalanceTemperatureAndTintValues(
    whiteBalanceTemperatureAndTint: WhiteBalanceTemperatureAndTint
  ) throws -> WhiteBalanceGains {
    // 1. Convert our type to the AVFoundation type
    let tintValues = AVCaptureDevice.WhiteBalanceTemperatureAndTintValues(
      temperature: Float(whiteBalanceTemperatureAndTint.temperature),
      tint: Float(whiteBalanceTemperatureAndTint.tint))
    // 2. Do the actual device conversion
    let gains = self.captureDevice.deviceWhiteBalanceGains(for: tintValues)
    // 3. Convert the returned AVFoundation gains to our type
    return WhiteBalanceGains(
      redGain: Double(gains.redGain),
      blueGain: Double(gains.blueGain),
      greenGain: Double(gains.greenGain))
  }

  func setWhiteBalanceLocked(whiteBalanceGains: WhiteBalanceGains) -> Promise<Void> {
    return captureDevice.withLock(queue) { completion in
      // 1. Ensure values are within valid range
      let device = self.captureDevice
      let redGain = Float(whiteBalanceGains.redGain)
      let greenGain = Float(whiteBalanceGains.greenGain)
      let blueGain = Float(whiteBalanceGains.blueGain)
      guard redGain >= 1 && redGain <= device.maxWhiteBalanceGain else {
        throw RuntimeError.error(
          withMessage:
            "`whiteBalanceGains.redGain` is not within the range of `1` to `device.maxWhiteBalanceGain`! (Received: \(redGain), min: 1.0, `device.maxWhiteBalanceGain`: \(device.maxWhiteBalanceGain)"
        )
      }
      guard greenGain >= 1 && greenGain <= device.maxWhiteBalanceGain else {
        throw RuntimeError.error(
          withMessage:
            "`whiteBalanceGains.greenGain` is not within the range of `1` to `device.maxWhiteBalanceGain`! (Received: \(greenGain), min: 1.0, `device.maxWhiteBalanceGain`: \(device.maxWhiteBalanceGain)"
        )
      }
      guard blueGain >= 1 && blueGain <= device.maxWhiteBalanceGain else {
        throw RuntimeError.error(
          withMessage:
            "`whiteBalanceGains.blueGain` is not within the range of `1` to `device.maxWhiteBalanceGain`! (Received: \(blueGain), min: 1.0, `device.maxWhiteBalanceGain`: \(device.maxWhiteBalanceGain)"
        )
      }

      // 2. Lock White Balance Gains
      let values = AVCaptureDevice.WhiteBalanceGains(
        redGain: redGain,
        greenGain: greenGain,
        blueGain: blueGain)
      device.setWhiteBalanceModeLocked(with: values) { _ in
        // 3. Once White Balance is locked, resolve the Promise
        completion()
      }
    }
  }

  func lockCurrentWhiteBalance() -> Promise<Void> {
    return captureDevice.withLock(queue) { completion in
      self.captureDevice.setWhiteBalanceModeLocked(with: AVCaptureDevice.currentWhiteBalanceGains) {
        _ in
        completion()
      }
    }
  }
}
