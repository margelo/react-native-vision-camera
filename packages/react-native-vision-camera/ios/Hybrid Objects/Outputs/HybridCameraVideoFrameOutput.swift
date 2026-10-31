///
/// HybridCameraVideoOutput.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules

final class HybridCameraVideoFrameOutput: HybridCameraVideoOutputSpec, NativeCameraOutput, RecorderDelegate {
  private let delegate: FrameDelegate
  private let options: VideoOutputOptions
  private let queue: DispatchQueue
  private let videoQueue: DispatchQueue
  private var audioSession: AudioSession? = nil
  let mediaType: MediaType = .video
  let requiresAudioInput: Bool = false
  let requiresDepthFormat: Bool = false
  let output: AVCaptureVideoDataOutput
  private var recorders = WeakArray<HybridFrameRecorder>()
  private let fileType: RecorderFileType

  var streamType: StreamType = .video
  var targetResolution: ResolutionRule {
    return .closestTo(options.targetResolution)
  }

  var outputOrientation: CameraOrientation = .up {
    didSet {
      guard let connection = output.connection(with: .video) else { return }
      // TODO: Should we apply that within the CameraSession's DispatchQueue? Batch it?
      try? connection.setOrientation(outputOrientation)
    }
  }
  var currentResolution: Size? {
    guard let connection = output.connection(with: .video) else { return nil }
    return connection.inputStreamResolution
  }

  // TODO: Support setting custom `targetBitRate`
  init(options: VideoOutputOptions) {
    self.output = AVCaptureVideoDataOutput()
    self.delegate = FrameDelegate()
    self.options = options
    self.fileType = options.fileType ?? .mov
    self.queue = DispatchQueue(
      label: "com.margelo.camera.video-frame",
      qos: .userInteractive,
      attributes: [],
      autoreleaseFrequency: .inherit,
      target: nil)
    self.videoQueue = DispatchQueue(
      label: "com.margelo.camera.video-frame.video",
      qos: .utility)
    super.init()

    // Set up our `delegate`
    output.setSampleBufferDelegate(delegate, queue: videoQueue)
    // Set the pixel format to the device native format.
    output.videoSettings = [:]
    // Queue up Frames if there are any hiccups in AVAssetWriter so we don't lose Frames.
    output.alwaysDiscardsLateVideoFrames = false
    // JS configures the video resolution, we don't want to downscale here.
    output.automaticallyConfiguresOutputBufferDimensions = false
    if #available(iOS 26.0, *) {
      // We only use this output for recording, allowing it to start deferred makes the session start faster.
      if output.isDeferredStartSupported {
        output.isDeferredStartEnabled = true
      }
      // Allow capturing HDR
      output.preservesDynamicHDRMetadata = true
    }
    // set the delegate to append to the Recorder
    delegate.onFrame = { [weak self] buffer, _, _, _, _ in
      guard let self else { return }
      self.onFrame(buffer, type: .video)
    }
  }

  func configure(config: OutputConfiguration) {
    // TODO: Set orientation via video metadata flags to avoid physically rotating buffers.
    //       The problem with that is that we need to support switching Camera devices on the fly,
    //       which rotates buffer later on somehow.
    guard let connection = output.connection(with: .video) else {
      return
    }
    try? connection.setMirrorMode(config.mirrorMode)
    try? connection.setOrientation(outputOrientation)
  }

  func getSupportedVideoCodecs() throws -> [VideoCodec] {
    guard output.connection(with: .video) != nil else {
      throw RuntimeError.error(
        withMessage:
          "Cannot call `getSupportedVideoCodecs()` when VideoOutput is not yet connected to the CameraSession!"
      )
    }
    let availableCodecs = output.availableVideoCodecTypesForAssetWriter(writingTo: fileType.toAVFileType())
    return availableCodecs.map { VideoCodec(avCodec: $0) }
  }

  func setOutputSettings(settings: VideoOutputSettings) -> Promise<Void> {
    return Promise.parallel(queue) {
      var currentSettings = self.output.videoSettings ?? [:]

      // codec={..}
      if let codec = settings.codec {
        let avCodec = try codec.toAVVideoCodecType()
        let availableCodecs = self.output.availableVideoCodecTypesForAssetWriter(
          writingTo: self.fileType.toAVFileType())
        guard availableCodecs.contains(avCodec) else {
          throw RuntimeError.error(
            withMessage: "VideoOutput does not support the codec \"\(codec.stringValue)\"!")
        }
        currentSettings[AVVideoCodecKey] = avCodec
      }

      self.output.videoSettings = currentSettings
    }
  }

  func createRecorder(settings: RecorderSettings) -> Promise<any HybridRecorderSpec> {
    return Promise.parallel(queue) {
      // 1. Create AVAssetWriter Recorder
      let clock = try self.getMasterClock()
      let recorder = try HybridFrameRecorder(
        orientation: .up,
        masterClock: clock,
        fileType: self.fileType,
        settings: settings,
        delegate: self)
      // 2. Initialize its video track immediately
      guard
        let videoSettings = self.output.recommendedVideoSettingsForAssetWriter(
          writingTo: self.fileType.toAVFileType())
      else {
        throw RuntimeError.error(
          withMessage: "Cannot initialize Recorder - no available video settings were found!")
      }
      try recorder.initializeVideoTrack(withSettings: videoSettings)

      // 3. Set video metadata
      if #available(iOS 26.0, *) {
        // 2.1.a. Set video timescale if available. This avoids audio/video sync-drift in super long videos.
        recorder.setTimescale(self.output.recommendedMediaTimeScaleForAssetWriter)
        let codec = self.getCurrentVideoCodec()
        if let metadata = self.output.recommendedMovieMetadata(
          forVideoCodecType: codec, assetWriterOutputFileType: self.fileType.toAVFileType())
        {
          // 2.2. Set metadata if available
          try recorder.setMetadata(metadata, settings: settings)
        }
      } else {
        // 2.1.b. Set metadata before iOS 26.0
        try recorder.setMetadata([], settings: settings)
      }

      // 4. If we enable audio, also initialize the audio track
      if self.options.enableAudio == true {
        let audioSession = try self.getOrCreateAudioSession()
        let audioSettings = audioSession.output.recommendedAudioSettingsForAssetWriter(
          writingTo: self.fileType.toAVFileType())
        let audioFormat = audioSession.input.device.activeFormat
        try recorder.initializeAudioTrack(
          withSettings: audioSettings, format: audioFormat.formatDescription)
      }

      // 5. Add it to our state and return
      self.recorders.append(recorder)
      return recorder
    }
  }

  func onRecorderWillStart() {
    guard let audioSession else {
      return
    }
    audioSession.start()
  }

  func onRecorderDidStop() {
    guard let audioSession else {
      return
    }
    let hasActiveRecorders = recorders.values().contains { $0.isRecording }
    if !hasActiveRecorders {
      audioSession.stop()
    }
  }

  private func getCurrentVideoCodec() -> AVVideoCodecType {
    if let codec = self.output.videoSettings[AVVideoCodecKey] as? AVVideoCodecType {
      return codec
    }
    return .hevc
  }

  private func getMasterClock() throws -> CMClock {
    guard let connection = output.connection(with: .video) else {
      throw RuntimeError.error(
        withMessage: "The VideoOutput is not yet connected to the CameraSession!")
    }
    guard let inputPort = connection.inputPorts.first else {
      throw RuntimeError.error(withMessage: "The VideoOutput is not yet connected to an input!")
    }
    guard let clock = inputPort.clock else {
      throw RuntimeError.error(
        withMessage: "The VideoOutput's connected input device does not have a master clock!")
    }
    return clock
  }

  private func getOrCreateAudioSession() throws -> AudioSession {
    if let audioSession {
      // We already created an Audio AVCaptureSession, return it
      return audioSession
    }
    // 1. Create session
    let audioSession = try AudioSession()
    // 2. Add on frame listener
    audioSession.setOnFrameListener { [weak self] buffer, timestamp in
      guard let self else { return }
      self.onFrame(buffer, type: .audio)
    }
    // 3. Return it!
    self.audioSession = audioSession
    return audioSession
  }

  private func onFrame(_ buffer: CMSampleBuffer, type: TrackType) {
    for recorder in self.recorders.values() {
      if recorder.isRecording {
        recorder.append(buffer: buffer, ofType: type)
      }
    }
  }
}
