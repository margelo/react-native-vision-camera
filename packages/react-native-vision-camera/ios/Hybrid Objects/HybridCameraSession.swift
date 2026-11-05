///
/// HybridCameraSession.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules

final class HybridCameraSession: HybridCameraSessionSpec {
  let session: AVCaptureSession
  private static let queue: DispatchQueue = DispatchQueue(
    label: "com.margelo.camera.session",
    qos: .userInteractive,
    attributes: [],
    autoreleaseFrequency: .inherit,
    target: nil)

  // Whether JS wants the session running, so it can be restarted after a runtime error (as V4 did).
  private var shouldBeRunning = false
  private var lastRuntimeErrorRestart: Date?
  private var runtimeErrorObserver: NSObjectProtocol?

  init(enableMultiCam: Bool) {
    if enableMultiCam {
      self.session = AVCaptureMultiCamSession()
    } else {
      self.session = AVCaptureSession()
    }
    // We manage formats manually via `device.activeFormat`, so opt out of the
    // session's preset-based format selection upfront.
    self.session.sessionPreset = .inputPriority
    super.init()
    // AVFoundation stops the session on a runtime error (e.g. when media services are reset) and never restarts it.
    self.runtimeErrorObserver = NotificationCenter.default.addObserver(
      forName: AVCaptureSession.runtimeErrorNotification, object: self.session, queue: nil
    ) { [weak self] _ in
      self?.restartAfterRuntimeError()
    }
  }

  deinit {
    if let runtimeErrorObserver {
      NotificationCenter.default.removeObserver(runtimeErrorObserver)
    }
  }

  var isRunning: Bool {
    return session.isRunning
  }

  // pragma MARK: Configuration
  func configure(connections: [CameraSessionConnection], config: CameraSessionConfiguration?)
    -> Promise<[any HybridCameraControllerSpec]>
  {
    return Promise.parallel(Self.queue) {
      guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
        throw RuntimeError.error(withMessage: "Camera Permission not yet granted!")
      }

      // Ensure multi-cam is enabled if we have multiple inputs
      let isMultiCam = connections.count > 1
      if isMultiCam {
        guard self.session is AVCaptureMultiCamSession else {
          throw RuntimeError(
            "Cannot add multiple inputs (\(connections)) to a single-cam CameraSession! "
              + "Create your CameraSession as a multi-cam session (`enableMultiCamSupport = true`) to add multiple camera inputs.")
        }
      }

      logger.info("Reconfiguring CameraSession with \(connections.count) connection(s)...")

      // Resolve flat Connections upfront to AVCaptureDevice, AVOutput, etc etc
      let connections = try connections.map { try ResolvedCameraSessionConnection(connection: $0) }

      // Wrap the configuration in a batch
      self.session.beginConfiguration()
      defer {
        self.session.commitConfiguration()
        logger.info(
          "Successfully applied CameraSession configuration for \(connections.count) connection(s)!"
        )
      }

      // Detach all unwanted preview layers before touching inputs/outputs
      self.detachUnwantedPreviewLayers(connections)
      // Remove all unwanted inputs and add all new inputs
      try self.updateInputs(connections)
      // Remove all unwanted outputs and add all new outputs
      try self.updateOutputs(connections)
      // Remove all unwanted connections and add all new connections
      try self.updateConnections(connections)

      // Configure all individual inputs/outputs/connections (e.g. orientation/mirrorMode)
      for connection in connections {
        // connection:
        try self.configureConnection(connection, isMultiCam: isMultiCam)
        // outputs:
        self.configureOutputs(connection)
      }

      // If we have any Dynamic Range Constraints, we disable automatic color space selection on the AVCaptureSession.
      let hasCustomDynamicRangeConstraint = connections.contains { connection in
        return connection.constraints.contains { constraint in
          // If the user specified a custom DynamicRange, we cannot automatically adjust the ColorSpace
          return constraint.isType(VideoDynamicRangeConstraint.self)
        }
      }
      self.session.automaticallyConfiguresCaptureDeviceForWideColor = !hasCustomDynamicRangeConstraint

      // Haptics and System Sounds Playback
      if let allowHapticsAndSystemSoundsPlayback = config?.allowHapticsAndSystemSoundsPlayback {
        let audioSession = AVAudioSession.sharedInstance()
        if audioSession.allowHapticsAndSystemSoundsDuringRecording != allowHapticsAndSystemSoundsPlayback {
          try audioSession.setAllowHapticsAndSystemSoundsDuringRecording(allowHapticsAndSystemSoundsPlayback)
        }
      }
      // Background Audio Playback
      if #available(iOS 18.0, *) {
        if let allowBackgroundAudioPlayback = config?.allowBackgroundAudioPlayback {
          self.session.configuresApplicationAudioSessionToMixWithOthers = allowBackgroundAudioPlayback
        }
      }

      // Return CameraControllers per connection to adjust camera settings (focus, etc)
      return try connections.map { connection in
        return try HybridCameraController(device: connection.input, queue: Self.queue)
      }
    }
  }

  // pragma MARK: SessionConfiguration
  private func configureConnection(_ connection: ResolvedCameraSessionConnection, isMultiCam: Bool) throws {
    // Get a handle to the input
    let outputs = connection.outputs.map { $0.output.hybrid }
    let resolved = try ConstraintResolver.resolveConstraints(
      for: connection.input,
      constraints: connection.constraints,
      outputs: outputs,
      isMultiCam: isMultiCam)

    if let onSessionConfigSelected = connection.onSessionConfigSelected {
      // Notify JS callback that we resolved the constraints to a specific `config`
      let config = HybridCameraSessionConfig(
        negotiatedFormat: resolved.negotiatedFormat,
        enabledConstraints: resolved.enabledConstraints)
      onSessionConfigSelected(config)
    }

    let device = resolved.device

    // TODO: Should we bracket this under session.beginConfiguration() + commitConfiguration() calls?
    //       The `isVideoHDREnabled` docs recommend this, I think. But that prop doesn't always change.
    //       Let's add this later and profile the difference. I think large config changes could become
    //       faster, but I am not sure if small config changes stay fast or would get slower by this.

    // Lock for a device config change..
    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }

    // Format
    if device.activeFormat != resolved.negotiatedFormat.format {
      device.activeFormat = resolved.negotiatedFormat.format
    }
    if let depthFormat = resolved.negotiatedFormat.depthFormat {
      // On devices that support depth, `device.activeDepthDataFormat`
      // cannot be set to `nil`, so we only set the depth format when
      // we actually have a `negotiatedFormat.depthFormat`. Otherwise,
      // it's implicitly `nil`.
      if device.activeDepthDataFormat != depthFormat {
        device.activeDepthDataFormat = depthFormat
      }
    }

    // TODO: Do we want to do any sanity checks here? Or assume that the negotiated format is properly validated before being set here?

    // TODO: We could add a `allowFpsThrottling` flag in the future to run at variable frame rate.
    // FPS
    if let fps = resolved.enabledConstraints.selectedFPS {
      device.activeVideoMaxFrameDuration = CMTime(value: 1, timescale: Int32(fps))
      device.activeVideoMinFrameDuration = CMTime(value: 1, timescale: Int32(fps))
    }

    // Video Stabilization
    if let videoStabilizationMode = resolved.enabledConstraints.selectedVideoStabilizationMode {
      for connection in self.session.connections where !connection.isConnectedToPreview {
        guard connection.isVideoStabilizationSupported else { continue }
        connection.preferredVideoStabilizationMode = videoStabilizationMode.toAVCaptureVideoStabilizationMode()
      }
    }
    // Preview Stabilization
    if let previewStabilizationMode = resolved.enabledConstraints.selectedPreviewStabilizationMode {
      for connection in self.session.connections where connection.isConnectedToPreview {
        guard connection.isVideoStabilizationSupported else { continue }
        connection.preferredVideoStabilizationMode = previewStabilizationMode.toAVCaptureVideoStabilizationMode()
      }
    }

    // Dynamic Range
    if let dynamicRange = resolved.enabledConstraints.selectedVideoDynamicRange {
      device.activeColorSpace = dynamicRange.colorSpace.toAVCaptureColorSpace()
      // Bit-Depth + ColorRange is implicitly set via `activeFormat`'s pixel format
      if device.activeFormat.isVideoHDRSupported {
        if dynamicRange.isHDR {
          // TODO: If we refactor `TargetDynamicRange` to an enum, `EDR` (which `isVideoHDREnabled` effectively is) could be a separate value.
          // Effectively allow auto-switching to EDR
          device.automaticallyAdjustsVideoHDREnabled = true
        } else {
          // Effectively disable EDR entirely.
          device.automaticallyAdjustsVideoHDREnabled = false
          device.isVideoHDREnabled = false
        }
      }
    }
  }

  private func configureOutputs(_ connection: ResolvedCameraSessionConnection) {
    for outputConfiguration in connection.outputs {
      let outputConfig = OutputConfiguration(mirrorMode: outputConfiguration.mirrorMode)
      switch outputConfiguration.output {
      case .output(let output):
        output.configure(config: outputConfig)
      case .preview(let preview):
        preview.configure(config: outputConfig)
      }
    }
  }

  // pragma MARK: Start/Stop
  func start() -> Promise<Void> {
    return Promise.parallel(Self.queue) {
      self.shouldBeRunning = true
      if self.session.isRunning {
        return
      }
      self.session.startRunning()
    }
  }

  func stop() -> Promise<Void> {
    return Promise.parallel(Self.queue) {
      self.shouldBeRunning = false
      if !self.session.isRunning {
        return
      }
      self.session.stopRunning()
    }
  }

  private func restartAfterRuntimeError() {
    Self.queue.async { [weak self] in
      guard let self, self.shouldBeRunning, !self.session.isRunning else {
        return
      }
      // At most one restart per burst of errors, so a camera that keeps failing doesn't restart in a loop.
      if let lastRestart = self.lastRuntimeErrorRestart, Date().timeIntervalSince(lastRestart) < 5 {
        return
      }
      self.lastRuntimeErrorRestart = Date()
      logger.info("Restarting CameraSession after a runtime error...")
      self.session.startRunning()
    }
  }

  // pragma MARK: Helpers
  /**
   * Detach all preview layers that are not listed in the [targetConnections] array
   * from this [AVCaptureSession].
   * This must run before [updateInputs] or [updateOutputs], as those methods kill
   * preview connections without unsetting the `session`.
   */
  private func detachUnwantedPreviewLayers(_ targetConnections: [ResolvedCameraSessionConnection]) {
    let currentlyAttachedPreviewLayers = self.session.connections.compactMap { $0.videoPreviewLayer }
    for currentlyAttachedPreviewLayer in currentlyAttachedPreviewLayers {
      let containsAttachedPreviewLayer = targetConnections.contains { connection in
        return connection.isConnectedTo(preview: currentlyAttachedPreviewLayer)
      }
      if !containsAttachedPreviewLayer {
        logger.info("Removing preview \(currentlyAttachedPreviewLayer)...")
        currentlyAttachedPreviewLayer.session = nil
      }
    }
  }

  /**
   * Adds all inputs on the given [targetConnections] if they haven't been added yet,
   * and removes all current inputs that aren't listed in the [connections] array.
   */
  private func updateInputs(_ targetConnections: [ResolvedCameraSessionConnection]) throws {
    let requiresAudioInput = targetConnections.contains { $0.requiresAudioInput }

    // 1. Loop through all existing inputs in the session - if it's not in our `connections` array, we remove it
    for currentlyAttachedInput in self.session.inputs {
      if currentlyAttachedInput.isMicrophone {
        // It's a microphone/audio input - let's check if we want audio in any connection.
        if !requiresAudioInput {
          // 1.1.a. We don't want any audio input - remove it!
          logger.info("Removing audio input \(currentlyAttachedInput)...")
          self.session.removeInput(currentlyAttachedInput)
        }
      } else {
        // It's a normal camera device - let's check if we want it in connections.
        let containsCurrentlyAttachedInput = targetConnections.contains { connection in
          return connection.isConnectedTo(input: currentlyAttachedInput)
        }
        if !containsCurrentlyAttachedInput {
          // 1.1.b. We don't want this input - remove it!
          logger.info("Removing input \(currentlyAttachedInput)...")
          self.session.removeInput(currentlyAttachedInput)
        }
      }
    }
    // 2. Loop through all connection inputs - if it's not yet attached to the session, add it
    for connection in targetConnections {
      let device = connection.input.device
      let containsInput = self.session.inputs.contains { input in
        guard let deviceInput = input as? AVCaptureDeviceInput else {
          return false
        }
        return deviceInput.device == device
      }
      if !containsInput {
        // 2.1. It doesn't exist yet - add it to the session..
        let deviceInput = try AVCaptureDeviceInput(device: device)
        self.session.addInputWithNoConnections(deviceInput)
        // 2.2. Configure the input with initial settings
        if connection.initialZoom != nil || connection.initialExposureBias != nil {
          try applyInitialConfig(
            device: device,
            initialZoom: connection.initialZoom,
            initialExposureBias: connection.initialExposureBias)
        }
      }
    }
    // 3. If we need an audio input, add it now
    if requiresAudioInput {
      let containsAudioInput = self.session.inputs.contains { $0.isMicrophone }
      if !containsAudioInput {
        guard AVCaptureDevice.authorizationStatus(for: .audio) == .authorized else {
          throw RuntimeError.error(withMessage: "Audio Permission not yet granted!")
        }
        try self.session.addAudioInput()
      }
    }
  }

  /**
   * Adds all outputs on the given [targetConnections] if they haven't been added yet,
   * and removes all current outputs that aren't listed in the [targetConnections] array.
   * This includes special handling for `NativePreviewViewOutput`.
   */
  private func updateOutputs(_ targetConnections: [ResolvedCameraSessionConnection]) throws {
    // 1. Loop through all current CameraSession outputs - if it's not in our array, we remove it
    for currentlyAttachedOutput in self.session.outputs {
      let containsAttachedOutput = targetConnections.contains { connection in
        return connection.isConnectedTo(output: currentlyAttachedOutput)
      }
      if !containsAttachedOutput {
        // 1.1. We don't want this output - remove it!
        logger.info("Removing output \(currentlyAttachedOutput)...")
        self.session.removeOutput(currentlyAttachedOutput)
      }
    }
    // 2. Loop through all connections
    for connection in targetConnections {
      // 2.1. Loop through each output
      for output in connection.outputs {
        let containsOutput = self.session.containsOutput(output.output)
        if !containsOutput {
          // 2.2. It doesn't exist yet - add it to the session..
          try session.addOutputWithNoConnections(output.output)
        }
      }
    }
  }

  private func updateConnections(_ targetConnections: [ResolvedCameraSessionConnection]) throws {
    // By this time, `updateInputs(...)` and `updateOutputs(...)` has already been called.
    // This ensures that all unwanted inputs or outputs have been removed - and if an input
    // or output is removed from the session, the connection will also automatically be removed.
    // So we only need to worry about removing preview layer connections.

    // 1. Loop through all current CameraSession connections - if it's not in our array, we remove it
    for currentConnection in self.session.connections {
      let containsConnection = targetConnections.contains { $0.contains(connection: currentConnection) }
      if !containsConnection {
        // 1.1. We don't want this connection - remove it!
        logger.info("Removing connection \(currentConnection)...")
        self.session.removeConnection(currentConnection)
      }
    }

    // 2. Add all new connections that we don't have yet:
    for connection in targetConnections {
      // 2.1. Iterate through all outputs
      for outputConfiguration in connection.outputs {
        // 2.2. Add the camera -> output connection
        let containsConnection = self.session.containsConnection(
          input: connection.input.device,
          output: outputConfiguration.output)
        if !containsConnection {
          try self.session.addConnection(
            input: connection.input.device,
            output: outputConfiguration.output)
        }

        // 2.2. If this `output` requires audio, add this connection too
        if case .output(let output) = outputConfiguration.output {
          if output.requiresAudioInput {
            let hasAudioConnection = self.session.containsAudioConnection(to: output.output)
            if !hasAudioConnection {
              try self.session.addAudioConnection(to: output.output)
            }
          }
        }
      }
    }
  }

  private func applyInitialConfig(
    device: AVCaptureDevice,
    initialZoom: Double?,
    initialExposureBias: Double?
  ) throws {
    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }
    if let initialZoom = initialZoom {
      let clamped = max(
        min(initialZoom, device.maxAvailableVideoZoomFactor), device.minAvailableVideoZoomFactor)
      device.videoZoomFactor = clamped
    }
    if let initialExposure = initialExposureBias {
      let clamped = max(
        min(Float(initialExposure), device.maxExposureTargetBias), device.minExposureTargetBias)
      device.setExposureTargetBias(clamped)
    }
  }

  // pragma MARK: On Started/Stopped Listeners
  func addOnStartedListener(onStarted: @escaping () -> Void) throws -> ListenerSubscription {
    return self.session.addListener(for: AVCaptureSession.didStartRunningNotification) { _ in
      onStarted()
    }
  }

  func addOnStoppedListener(onStopped: @escaping () -> Void) throws -> ListenerSubscription {
    return self.session.addListener(for: AVCaptureSession.didStopRunningNotification) { _ in
      onStopped()
    }
  }

  // pragma MARK: On Error Listener
  func addOnErrorListener(onError: @escaping (any Error) -> Void) throws -> ListenerSubscription {
    return self.session.addListener(for: AVCaptureSession.runtimeErrorNotification) {
      notification in
      if let errorAny = notification.userInfo?[AVCaptureSessionErrorKey],
        let error = errorAny as? NSError
      {
        onError(error)
      } else {
        let unknownError = RuntimeError.error(
          withMessage:
            "CameraSession encountered an Error, but the payload didn't contain an `AVCaptureSessionErrorKey`!"
        )
        onError(unknownError)
      }
    }
  }

  // pragma MARK: On Interrupted Listeners
  func addOnInterruptionStartedListener(
    onInterruptionStarted: @escaping (InterruptionReason) -> Void
  ) throws -> ListenerSubscription {
    return self.session.addListener(for: AVCaptureSession.wasInterruptedNotification) {
      notification in
      if let reasonAny = notification.userInfo?[AVCaptureSessionInterruptionReasonKey],
        let reasonRawValue = reasonAny as? NSNumber,
        let avReason = AVCaptureSession.InterruptionReason(rawValue: reasonRawValue.intValue)
      {
        let reason = InterruptionReason(reason: avReason)
        onInterruptionStarted(reason)
      } else {
        onInterruptionStarted(.unknown)
      }
    }
  }

  func addOnInterruptionEndedListener(onInterruptionEnded: @escaping () -> Void) throws
    -> ListenerSubscription
  {
    return self.session.addListener(for: AVCaptureSession.interruptionEndedNotification) { _ in
      onInterruptionEnded()
    }
  }
}
