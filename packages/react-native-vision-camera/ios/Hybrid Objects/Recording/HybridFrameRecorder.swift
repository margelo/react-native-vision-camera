//
//  HybridFrameRecorder.swift
//  VisionCamera
//
//  Created by Marc Rousavy on 05.01.26.
//

import AVFoundation
import Foundation
import NitroModules

final class HybridFrameRecorder: HybridRecorderSpec {
  private let orientation: CameraOrientation
  private let masterClock: CMClock
  private let fileURL: URL
  private let assetWriter: AVAssetWriter
  private var videoTrack: Track?
  private var audioTrack: Track?
  private let queue: DispatchQueue
  private var isFinishing = false
  private let delegate: RecorderDelegate
  private let settings: RecorderSettings

  /// Sum of all appended sample sizes. Accumulated rather than stat'd because
  /// `AVAssetWriter` buffers writes, so on-disk size lags significantly behind
  /// the actual recorded data until `finishWriting` flushes.
  private var accumulatedBytes: Int64 = 0

  private var onRecordingFinished: ((String, RecordingFinishedReason) -> Void)? = nil
  private var onRecordingError: ((any Error) -> Void)? = nil
  private var onRecordingPaused: (() -> Void)? = nil
  private var onRecordingResumed: (() -> Void)? = nil

  private var isFinished: Bool {
    let isVideoTrackFinished = videoTrack?.isFinished ?? true
    let isAudioTrackFinished = audioTrack?.isFinished ?? true
    return isVideoTrackFinished && isAudioTrackFinished
  }

  init(
    orientation: CameraOrientation,
    masterClock: CMClock,
    fileType: RecorderFileType,
    settings: RecorderSettings,
    delegate: RecorderDelegate
  ) throws {
    self.orientation = orientation
    self.masterClock = masterClock
    self.fileURL = try URL.createTempURL(fileType: fileType.toUTType())
    self.assetWriter = try AVAssetWriter(outputURL: fileURL, fileType: fileType.toAVFileType())
    self.assetWriter.shouldOptimizeForNetworkUse = false
    self.queue = DispatchQueue(
      label: "com.margelo.camera.recorder",
      qos: .utility
    )
    self.delegate = delegate
    self.settings = settings

    super.init()
  }

  deinit {
    if assetWriter.status == .writing {
      logger.error("HybridFrameRecorder was deallocated while writing, cancelling AssetWriter...")
      assetWriter.cancelWriting()
    }
  }

  var isRecording: Bool {
    return assetWriter.status == .writing
  }

  var isPaused: Bool {
    return videoTrack?.isPaused == true
  }

  var recordedDuration: Double {
    return videoTrack?.duration.seconds ?? 0.0
  }

  var recordedFileSize: Double {
    if let attrs = try? FileManager.default.attributesOfItem(atPath: filePath),
      let sizeBytes = attrs[.size] as? NSNumber
    {
      return sizeBytes.doubleValue
    }
    return 0.0
  }

  var filePath: String {
    return fileURL.path
  }

  func initializeVideoTrack(withSettings settings: [String: Any]) throws {
    guard !settings.isEmpty else {
      throw RuntimeError.error(withMessage: "Tried to initialize Video Track with empty options!")
    }
    guard videoTrack == nil else {
      throw RuntimeError.error(withMessage: "Tried to initialize Video Track twice!")
    }
    guard assetWriter.canApply(outputSettings: settings, forMediaType: .video) else {
      throw RuntimeError.error(
        withMessage: "The given output settings are not supported! \(settings)")
    }

    logger.info("Initializing Video AssetWriter with settings: \(settings)")
    let videoWriter = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    videoWriter.expectsMediaDataInRealTime = true
    videoWriter.transform = orientation.affineTransform
    assetWriter.add(videoWriter)
    videoTrack = Track(ofType: .video, withAssetWriterInput: videoWriter, andClock: masterClock)
    logger.info("Initialized Video AssetWriter!")
  }

  func setTimescale(_ timescale: CMTimeScale) {
    logger.info("Setting AVAssetWriter timescale to \(timescale)...")
    assetWriter.movieTimeScale = timescale
  }

  func setMetadata(_ metadata: [AVMetadataItem], settings: RecorderSettings) throws {
    logger.info("Setting AVAssetWriter metadata: \(metadata)...")
    var metadata = metadata
    metadata.append(.libraryTag)
    if let hybridLocation = settings.location {
      guard let location = hybridLocation as? any NativeLocation else {
        throw RuntimeError.error(withMessage: "Location is not of type `NativeLocation`!")
      }
      let locationTag = try location.location.toAVMutableMetadataItem()
      metadata.append(locationTag)
    }
    assetWriter.metadata = metadata
  }

  func initializeAudioTrack(withSettings settings: [String: Any]?, format: CMFormatDescription)
    throws
  {
    guard audioTrack == nil else {
      throw RuntimeError.error(withMessage: "Tried to initialize Audio Track twice!")
    }

    if let settings = settings {
      logger.info("Initializing Audio AssetWriter with settings: \(settings)")
    } else {
      logger.info("Initializing Audio AssetWriter default settings...")
    }
    let audioWriter = AVAssetWriterInput(
      mediaType: .audio, outputSettings: settings, sourceFormatHint: format)
    audioWriter.expectsMediaDataInRealTime = true
    assetWriter.add(audioWriter)
    audioTrack = Track(ofType: .audio, withAssetWriterInput: audioWriter, andClock: masterClock)
    logger.info("Initialized Audio AssetWriter!")
  }

  func startRecording(
    onRecordingFinished: @escaping (String, RecordingFinishedReason) -> Void,
    onRecordingError: @escaping (any Error) -> Void,
    onRecordingPaused: (() -> Void)?,
    onRecordingResumed: (() -> Void)?
  ) throws -> Promise<Void> {
    return Promise.parallel(queue) {
      guard !self.isRecording else {
        throw RuntimeError.error(withMessage: "Tried starting Recorder twice!")
      }

      // Notify about to start
      self.delegate.onRecorderWillStart()

      // Prepare the AssetWriter for writing to the video file
      let success = self.assetWriter.startWriting()
      guard success else {
        let error = self.assetWriter.error?.localizedDescription ?? "(no error)"
        self.delegate.onRecorderDidStop()
        throw RuntimeError.error(withMessage: "Failed to start AssetWriter! Error: \(error)")
      }
      logger.info("AssetWriter started writing to \(self.filePath)!")

      // Assign callbacks
      self.onRecordingFinished = onRecordingFinished
      self.onRecordingError = onRecordingError
      self.onRecordingPaused = onRecordingPaused
      self.onRecordingResumed = onRecordingResumed

      // Start the session at the specific timestamp
      let now = self.masterClock.time
      self.assetWriter.startSession(atSourceTime: now)

      // Start each track
      self.videoTrack?.start()
      self.audioTrack?.start()
    }
  }

  func stopRecording() throws -> Promise<Void> {
    return Promise.parallel(queue) {
      // Stop each track
      self.videoTrack?.stop()
      self.audioTrack?.stop()

      // Start a timeout that will force-stop the session if it still hasn't been stopped (maybe no more frames came in?)
      let videoLatency = self.videoTrack?.latency.seconds ?? 0.0
      let audioLatency = self.audioTrack?.latency.seconds ?? 0.0
      let latency = max(videoLatency, audioLatency)
      let timeout = max(latency * 2, 0.1 /* wait 100ms by default */)
      self.queue.asyncAfter(deadline: .now() + timeout) {
        if !self.isFinishing {
          logger.error(
            "Waited \(timeout) seconds, but the session is still not finished - force-stopping session..."
          )
          self.finishSuccessfully(reason: .stopped)
        }
      }
    }
  }

  func pauseRecording() throws -> Promise<Void> {
    return Promise.parallel(queue) {
      // Pause each track
      self.videoTrack?.pause()
      self.audioTrack?.pause()

      // Notify listener
      self.onRecordingPaused?()
    }
  }

  func resumeRecording() throws -> Promise<Void> {
    return Promise.parallel(queue) {
      // Resume each track
      self.videoTrack?.resume()
      self.audioTrack?.resume()

      // Notify listener
      self.onRecordingResumed?()
    }
  }

  func cancelRecording() throws -> Promise<Void> {
    return Promise.parallel(queue) {
      guard self.assetWriter.status == .writing else {
        throw RuntimeError.error(withMessage: "Not currently recording!")
      }
      // Clear callbacks so they don't fire during cancellation
      self.onRecordingFinished = nil
      self.onRecordingError = nil
      self.onRecordingPaused = nil
      self.onRecordingResumed = nil
      // Cancel the writing session
      self.isFinishing = true
      self.assetWriter.cancelWriting()
      self.delegate.onRecorderDidStop()
      // Delete the temporary file
      try FileManager.default.removeItem(at: self.fileURL)
    }
  }

  func append(buffer: CMSampleBuffer, ofType type: TrackType) {
    queue.async {
      if self.isFinishing {
        // Session is already finishing - can't write anything more
        return
      }

      // If the writer has already transitioned out of `.writing` (e.g. an
      // asynchronous resource failure), abort the recording
      if self.assetWriter.status != .writing {
        let error = RuntimeError("Frame arrived, but AssetWriter status is \(self.assetWriter.status.rawValue)!")
        self.abort(withError: error)
        return
      }

      // Write buffer to video/audio track
      do {
        let track = try self.getTrack(ofType: type)
        try track.append(buffer: buffer)
        self.accumulatedBytes += Int64(CMSampleBufferGetTotalSampleSize(buffer))
      } catch {
        self.abort(withError: error)
        return
      }

      // The append itself succeeded, but the writer may still have failed mid-way
      if self.assetWriter.status == .failed {
        let error = self.assetWriter.error ?? RuntimeError("AssetWriter failed to write Buffer!")
        self.abort(withError: error)
        return
      }

      // Check if we reached any configured recording limits
      if self.reachedDurationLimit() {
        self.finishSuccessfully(reason: .maxDurationReached)
        return
      }
      if self.reachedFileSizeLimit() {
        self.finishSuccessfully(reason: .maxFileSizeReached)
        return
      }

      // All tracks (video + audio) have drained after `stopRecording()` -
      // finish the Recording cleanly
      if self.isFinished {
        self.finishSuccessfully(reason: .stopped)
      }
    }
  }

  private func reachedFileSizeLimit() -> Bool {
    if let maxFileSize = settings.maxFileSize {
      // Check if video size >= max target file size
      if accumulatedBytes >= Int64(maxFileSize) {
        logger.info("Reached maxFileSize of \(maxFileSize) bytes - finishing recording.")
        return true
      }
    }
    return false
  }
  private func reachedDurationLimit() -> Bool {
    if let maxDuration = settings.maxDuration,
      let duration = videoTrack?.duration
    {
      // Check if video track duration >= max target duration
      let maxDuration = CMTime(seconds: maxDuration, preferredTimescale: 600)
      if CMTimeCompare(duration, maxDuration) >= 0 {
        logger.info("Reached maxDuration of \(maxDuration.seconds)s - finishing recording.")
        return true
      }
    }
    return false
  }

  @inline(__always)
  private func getTrack(ofType type: TrackType) throws -> Track {
    switch type {
    case .audio:
      guard let audioTrack else {
        throw RuntimeError.error(
          withMessage: "Tried to write an audio buffer, but no audio track was initialized!")
      }
      return audioTrack
    case .video:
      guard let videoTrack else {
        throw RuntimeError.error(
          withMessage: "Tried to write a video buffer, but no video track was initialized!")
      }
      return videoTrack
    }
  }

  /// Finish the recording cleanly with the given `reason`, closing the video
  /// file and firing `onRecordingFinished`. Idempotent - calling this while
  /// already finishing is a no-op.
  private func finishSuccessfully(reason: RecordingFinishedReason) {
    if isFinishing {
      // Another condition already triggered a finish; ignore
      return
    }

    // We need at least one recorded video frame to produce a valid file
    guard let videoTrack,
      let lastVideoTimestamp = videoTrack.lastTimestamp
    else {
      let error = RuntimeError("Cannot finish recording - no video frames were ever recorded!")
      abort(withError: error)
      return
    }

    isFinishing = true

    logger.info("Finishing recording (reason: \(reason.stringValue)) at \(lastVideoTimestamp.seconds)s...")
    // End the session at the last video frame's timestamp. Any audio frames
    // received after this timestamp are cut off
    assetWriter.endSession(atSourceTime: lastVideoTimestamp)
    assetWriter.finishWriting {
      logger.info("AssetWriter finished writing successfully!")
      self.onRecordingFinished?(self.filePath, reason)
      self.delegate.onRecorderDidStop()
    }
  }

  /// Abort the recording because something went wrong, cancelling the writer
  /// and firing `onRecordingError`. Idempotent - calling this while already
  /// finishing is a no-op, so we can never fire more than one terminal event
  /// per recording.
  private func abort(withError error: any Error) {
    if isFinishing {
      // Another condition already triggered a finish; ignore this error
      return
    }
    isFinishing = true

    logger.error("Aborting recording: \(error)")
    assetWriter.cancelWriting()
    onRecordingError?(error)
    delegate.onRecorderDidStop()
  }
}
