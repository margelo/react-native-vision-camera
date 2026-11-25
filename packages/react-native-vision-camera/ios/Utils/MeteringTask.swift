//
//  MeteringTask.swift
//  VisionCamera
//
//  Created by Marc Rousavy on 20.01.26.
//

import AVFoundation
import Foundation
import NitroModules

/// Represents an ongoing Metering operation in the Camera pipeline.
///
/// A Metering operation can track one or more metering modes (AE, AF, AWB),
/// and will call its `onComplete` listener once all desired metering modes
/// have successfully settled.
///
/// To avoid premature completion, all metering tasks have to be settled
/// for a duration of at least 120ms before the completion handler is called.
///
/// If a `MeteringTask` is destroyed (or canceled), the `onError` listener
/// will be called.
///
/// Tip: Avoid setting AE/AF/AWB outside of this `MeteringTask`.
/// It's tricky to get it working, and easy to do something wrong - but if you
/// need it, here's a quick usage guide; lock device first, set focus/exposure
/// point if needed, _then_ set focus/exposure/white-balance mode (.auto... for
/// focus once and .continuousAuto... for keep tracking actively. You only need .locked
/// after it has focused stable to keep it, but leaving it at .auto... does the same implicitly.)
final class MeteringTask {
  private let minStableFocusDurationUntilResolve: TimeInterval = 0.12  // 120ms
  private let pollInterval: TimeInterval = 0.05  // 50ms
  private let timeout: TimeInterval = 10.0  // 10s
  private let queue: DispatchQueue
  private let device: AVCaptureDevice
  private var meteringStates: [MeteringMode: MeteringProgress]
  private let adaptiveness: SceneAdaptiveness
  private let autoReset: AutoReset
  private var observations: [NSKeyValueObservation] = []
  private var pollTimer: DispatchSourceTimer?
  private var timeoutTimer: DispatchSourceTimer?
  private var isFinished = false
  private var onComplete: (() -> Void)? = nil
  private var onError: ((Error) -> Void)? = nil

  private struct MeteringProgress {
    var settledAt: Date? = nil
  }
  private enum MeteringError: Error, CustomStringConvertible {
    case timeouted
    case canceled

    var description: String {
      switch self {
      case .timeouted:
        return "The metering operation has timeouted!"
      case .canceled:
        return "The metering operation has been canceled!"
      }
    }
  }
  enum AutoReset {
    case after(seconds: Double)
    case never
  }

  init(
    device: AVCaptureDevice,
    adaptiveness: SceneAdaptiveness,
    autoReset: AutoReset,
    on queue: DispatchQueue
  ) {
    self.queue = queue
    self.device = device
    self.adaptiveness = adaptiveness
    self.autoReset = autoReset
    // if a MeteringState is not in here, we don't track it.
    self.meteringStates = [:]
  }

  deinit {
    destroy()
  }

  /**
   * Starts tracking progress for this `MeteringTask`
   */
  func startListening(
    onComplete: @escaping () -> Void,
    onError: @escaping (Error) -> Void
  ) {
    self.onComplete = onComplete
    self.onError = onError
    // the Timer periodically polls AE/AF/AWB state - this is how we can ensure the states have
    // been stable for 120ms+ and aren't just fluctuating.
    let pollTimer = DispatchSource.makeTimerSource(queue: queue)
    pollTimer.schedule(deadline: .now(), repeating: pollInterval)
    pollTimer.setEventHandler { [weak self] in self?.update() }
    pollTimer.resume()
    self.pollTimer = pollTimer

    let timeoutTimer = DispatchSource.makeTimerSource(queue: queue)
    timeoutTimer.schedule(deadline: .now() + timeout)
    timeoutTimer.setEventHandler { [weak self] in self?.onTimedOut() }
    timeoutTimer.resume()
    self.timeoutTimer = timeoutTimer
    logger.info("Started metering operations...")
  }

  /**
   * Cancels the currently active `MeteringTask`.
   */
  func cancel() {
    guard !isFinished else { return }
    logger.info("Canceling metering operations...")
    onError?(MeteringError.canceled)
    isFinished = true
    destroy()
  }

  private func destroy() {
    logger.info("Destroying `MeteringTask`...")
    observations.forEach { $0.invalidate() }
    observations.removeAll()
    pollTimer?.cancel()
    pollTimer = nil
    timeoutTimer?.cancel()
    timeoutTimer = nil
    if !isFinished {
      onError?(MeteringError.timeouted)
      isFinished = true
    }
  }

  private func onTimedOut() {
    guard !isFinished else { return }
    logger.info("Metering operations timed out after \(self.timeout) seconds!")
    destroy()
  }

  private func update() {
    guard !isFinished else { return }

    // 1. Check if all metering states have been settled for at least
    //    the `minStableFocusDurationUntilResolve` duration. (120ms)
    let now = Date()
    let allSettledForStableDuration = self.meteringStates.values.allSatisfy { progress in
      guard let settledAt = progress.settledAt else {
        // This metering state has not been settled at all yet!
        return false
      }
      let settledSince = now.timeIntervalSince(settledAt)
      return settledSince >= minStableFocusDurationUntilResolve
    }
    if allSettledForStableDuration {
      // 2. All states have been settled since 120ms+ now - complete it!
      logger.info(
        "All metering operations have been settled for at least \(self.minStableFocusDurationUntilResolve) seconds - completed!"
      )
      onComplete?()
      isFinished = true
      destroy()
      // After completion, update AE/AF/AWB to locked or continuous tracking
      switch adaptiveness {
      case .continuous:
        try? setMeteringValuesToContinuous()
      case .locked:
        try? setMeteringValuesToLocked()
      }
      // Start the timer for auto reset (if enabled)
      if case .after(let seconds) = self.autoReset {
        self.queue.asyncAfter(deadline: .now() + seconds) { [weak self] in
          guard let self else { return }
          try? self.resetMeteringValues()
        }
      }
    }
  }

  private func setMeteringValuesToLocked() throws {
    logger.info("Locking AE/AF/AWB values...")
    let exposureMode: AVCaptureDevice.ExposureMode? = device.isExposureModeSupported(.locked) ? .locked : nil
    let focusMode: AVCaptureDevice.FocusMode? = device.isFocusModeSupported(.locked) ? .locked : nil
    let whiteBalanceMode: AVCaptureDevice.WhiteBalanceMode? = device.isWhiteBalanceModeSupported(.locked) ? .locked : nil
    try setMeteringValues(
      focusPoint: nil,
      exposure: exposureMode,
      focus: focusMode,
      whiteBalance: whiteBalanceMode)
  }

  private func setMeteringValuesToContinuous() throws {
    logger.info("Setting AE/AF/AWB values to continuously auto-focus...")
    try setMeteringValues(
      focusPoint: nil,
      exposure: getExposureModeIfSupported(responsiveness: .steady),
      focus: getFocusModeIfSupported(responsiveness: .steady),
      whiteBalance: getWhiteBalanceModeIfSupported(responsiveness: .steady))
  }

  private func resetMeteringValues() throws {
    logger.info("Resetting AE/AF/AWB values to continuously auto-focus at center...")
    try setMeteringValues(
      focusPoint: CGPoint(x: 0.5, y: 0.5),
      exposure: getExposureModeIfSupported(responsiveness: .steady),
      focus: getFocusModeIfSupported(responsiveness: .steady),
      whiteBalance: getWhiteBalanceModeIfSupported(responsiveness: .steady))
  }

  private func setMeteringValues(
    focusPoint: CGPoint?,
    exposure: AVCaptureDevice.ExposureMode?,
    focus: AVCaptureDevice.FocusMode?,
    whiteBalance: AVCaptureDevice.WhiteBalanceMode?
  ) throws {
    try self.device.lockForConfiguration()
    defer { self.device.unlockForConfiguration() }
    // Lock AE
    if meteringStates.keys.contains(.ae) {
      if let focusPoint, self.device.isExposurePointOfInterestSupported {
        self.device.exposurePointOfInterest = focusPoint
        logger.debug("AE point = \(focusPoint.debugDescription)")
      }
      if let exposure, self.device.isExposureModeSupported(exposure) {
        self.device.exposureMode = exposure
        logger.debug("AE = \(exposure.rawValue)")
      }
    }
    // Lock AF
    if meteringStates.keys.contains(.af) {
      if let focusPoint, self.device.isFocusPointOfInterestSupported {
        self.device.focusPointOfInterest = focusPoint
        logger.debug("AF point = \(focusPoint.debugDescription)")
      }
      if let focus, self.device.isFocusModeSupported(focus) {
        self.device.focusMode = focus
        logger.debug("AF = \(focus.rawValue)")
      }
    }
    // Lock AWB
    if meteringStates.keys.contains(.awb) {
      if let whiteBalance, self.device.isWhiteBalanceModeSupported(whiteBalance) {
        self.device.whiteBalanceMode = whiteBalance
        logger.debug("AWB = \(whiteBalance.rawValue)")
      }
    }
  }

  private func onMeteringRequested(for mode: MeteringMode) {
    self.meteringStates[mode] = MeteringProgress()
  }
  private func onMeteringAdjusting(for mode: MeteringMode) {
    self.meteringStates[mode] = MeteringProgress()
  }
  private func onMeteringSettled(for mode: MeteringMode) {
    let settledAt = self.meteringStates[mode]?.settledAt ?? .now
    self.meteringStates[mode] = MeteringProgress(settledAt: settledAt)
  }
  private func onMeteringChanged(for mode: MeteringMode, isAdjusting: Bool) {
    guard !isFinished else { return }
    if isAdjusting {
      self.onMeteringAdjusting(for: mode)
    } else {
      self.onMeteringSettled(for: mode)
    }
    self.update()
  }

  /**
   * Starts metering exposure (AE) to the given `CGPoint`.
   * This method throws if the `AVCaptureDevice` isn't currently locked for configuration.
   */
  func startMeteringAE(to point: CGPoint, responsiveness: FocusResponsiveness) throws {
    guard self.device.isExposurePointOfInterestSupported else {
      throw RuntimeError.error(withMessage: "Metering Mode `AE` is not supported on this device!")
    }
    logger.info("Started metering AE to \(point.debugDescription)...")
    // Track AE completion
    self.onMeteringRequested(for: .ae)
    self.observations.append(
      device.observe(
        \.isAdjustingExposure,
        options: [.new]
      ) { [weak self] _, _ in
        guard let self else { return }
        self.queue.async {
          self.onMeteringChanged(for: .ae, isAdjusting: self.device.isAdjustingExposure)
        }
      })
    // Request AF to lock to the specific point
    self.device.exposurePointOfInterest = point
    self.device.exposureMode = try getExposureMode(responsiveness: responsiveness)
  }

  /**
   * Starts metering focus (AF) to the given `CGPoint`.
   * This method throws if the `AVCaptureDevice` isn't currently locked for configuration.
   */
  func startMeteringAF(to point: CGPoint, responsiveness: FocusResponsiveness) throws {
    guard self.device.isFocusPointOfInterestSupported else {
      throw RuntimeError.error(withMessage: "Metering Mode `AF` is not supported on this device!")
    }
    logger.info("Started metering AF to \(point.debugDescription)...")
    // Track AF completion
    self.onMeteringRequested(for: .af)
    self.observations.append(
      device.observe(
        \.isAdjustingFocus,
        options: [.new]
      ) { [weak self] _, _ in
        guard let self else { return }
        self.queue.async {
          self.onMeteringChanged(for: .af, isAdjusting: self.device.isAdjustingFocus)
        }
      })
    // Request AF to lock to the specific point
    device.focusPointOfInterest = point
    device.focusMode = try getFocusMode(responsiveness: responsiveness)
  }

  /**
   * Starts metering white balance (AWB).
   * This method throws if the `AVCaptureDevice` isn't currently locked for configuration.
   */
  func startMeteringAWB(responsiveness: FocusResponsiveness) throws {
    logger.info("Started metering AWB...")
    // Track AWB completion
    self.onMeteringRequested(for: .awb)
    self.observations.append(
      device.observe(
        \.isAdjustingWhiteBalance,
        options: [.new]
      ) { [weak self] _, _ in
        guard let self else { return }
        self.queue.async {
          self.onMeteringChanged(for: .awb, isAdjusting: self.device.isAdjustingWhiteBalance)
        }
      })
    // Request AWB to focus
    device.whiteBalanceMode = try getWhiteBalanceMode(responsiveness: responsiveness)
  }

  private func getExposureMode(responsiveness: FocusResponsiveness) throws
    -> AVCaptureDevice.ExposureMode
  {
    guard let mode = getExposureModeIfSupported(responsiveness: responsiveness) else {
      throw RuntimeError.error(withMessage: "Metering Mode `AE` is not supported on this device!")
    }
    return mode
  }

  private func getExposureModeIfSupported(responsiveness: FocusResponsiveness)
    -> AVCaptureDevice.ExposureMode?
  {
    if responsiveness == .snappy {
      if device.isExposureModeSupported(.autoExpose) {
        // Use snappy AE if supported
        return .autoExpose
      } else if device.isExposureModeSupported(.continuousAutoExposure) {
        // Fall back to steady continuous AE otherwise
        return .continuousAutoExposure
      }
    } else if responsiveness == .steady {
      if device.isExposureModeSupported(.continuousAutoExposure) {
        // Use steady continuous AE if supported
        return .continuousAutoExposure
      } else if device.isExposureModeSupported(.autoExpose) {
        // Fall back to snappy AE otherwise
        return .autoExpose
      }
    }
    return nil
  }

  private func getFocusMode(responsiveness: FocusResponsiveness) throws -> AVCaptureDevice.FocusMode {
    guard let mode = getFocusModeIfSupported(responsiveness: responsiveness) else {
      throw RuntimeError.error(withMessage: "Metering Mode `AF` is not supported on this device!")
    }
    return mode
  }

  private func getFocusModeIfSupported(responsiveness: FocusResponsiveness) -> AVCaptureDevice.FocusMode? {
    if responsiveness == .snappy {
      if device.isFocusModeSupported(.autoFocus) {
        // Use snappy AF if supported
        return .autoFocus
      } else if device.isFocusModeSupported(.continuousAutoFocus) {
        // Fall back to steady continuous AF otherwise
        return .continuousAutoFocus
      }
    } else if responsiveness == .steady {
      if device.isFocusModeSupported(.continuousAutoFocus) {
        // Use steady continuous AF if supported
        return .continuousAutoFocus
      } else if device.isFocusModeSupported(.autoFocus) {
        // Fall back to snappy AWB otherwise
        return .autoFocus
      }
    }
    return nil
  }

  private func getWhiteBalanceMode(responsiveness: FocusResponsiveness) throws
    -> AVCaptureDevice.WhiteBalanceMode
  {
    guard let mode = getWhiteBalanceModeIfSupported(responsiveness: responsiveness) else {
      throw RuntimeError.error(withMessage: "Metering Mode `AWB` is not supported on this device!")
    }
    return mode
  }

  private func getWhiteBalanceModeIfSupported(responsiveness: FocusResponsiveness)
    -> AVCaptureDevice.WhiteBalanceMode?
  {
    if responsiveness == .snappy {
      if device.isWhiteBalanceModeSupported(.autoWhiteBalance) {
        // Use snappy AWB if supported
        return .autoWhiteBalance
      } else if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
        // Fall back to steady continuous AWB otherwise
        return .continuousAutoWhiteBalance
      }
    } else if responsiveness == .steady {
      if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
        // Use steady continuous AWB if supported
        return .continuousAutoWhiteBalance
      } else if device.isWhiteBalanceModeSupported(.autoWhiteBalance) {
        // Fall back to snappy AWB otherwise
        return .autoWhiteBalance
      }
    }
    return nil
  }
}
