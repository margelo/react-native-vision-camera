///
/// HybridCameraFrameOutput.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules

final class HybridCameraFrameOutput: HybridCameraFrameOutputSpec, NativeCameraOutput {
  private let delegate: FrameDelegate
  private let queue: DispatchQueue
  private let queueSpecificKey = DispatchSpecificKey<Void>()
  private var mirrorMode: MirrorMode = .auto
  private let options: FrameOutputOptions
  let mediaType: MediaType = .video
  let requiresAudioInput: Bool = false
  let requiresDepthFormat: Bool = false
  let output: AVCaptureVideoDataOutput
  lazy var thread: any HybridNativeThreadSpec = {
    return HybridNativeThread(queue: queue)
  }()
  var outputOrientation: CameraOrientation = .up {
    didSet {
      guard let connection = output.connection(with: .video) else { return }
      if options.enablePhysicalBufferRotation {
        // TODO: Should we apply that within the CameraSession's DispatchQueue? Batch it?
        try? connection.setOrientation(outputOrientation)
      }
    }
  }
  var currentResolution: Size? {
    guard let connection = output.connection(with: .video) else { return nil }
    return connection.inputStreamResolution
  }

  var streamType: StreamType = .video
  var targetResolution: ResolutionRule {
    return .closestTo(options.targetResolution)
  }

  init(options: FrameOutputOptions) {
    self.output = AVCaptureVideoDataOutput()
    self.delegate = FrameDelegate()
    self.options = options
    self.queue = DispatchQueue(
      label: "com.margelo.camera.frame",
      qos: .userInteractive,
      attributes: [],
      autoreleaseFrequency: .inherit,
      target: nil)
    self.queue.setSpecific(key: queueSpecificKey, value: ())
    super.init()

    // Set up our `delegate`
    output.setSampleBufferDelegate(delegate, queue: queue)
    // Configure `videoSettings`
    output.videoSettings = videoSettingsForPixelFormat(options.pixelFormat)
    // If the pipeline stalls, drop frames to avoid blowing up RAM
    output.alwaysDiscardsLateVideoFrames = options.dropFramesWhileBusy
    // JS configures the video resolution, we don't want to downscale here by default.
    output.automaticallyConfiguresOutputBufferDimensions = false
    if #available(iOS 26.0, *), output.isDeferredStartSupported {
      // Deferred start allows the Session to delay this output's startup in favor
      // of preview-related outputs to make preview appear faster.
      output.isDeferredStartEnabled = options.allowDeferredStart
    }
    // TODO: Add a flag called `allowBufferResizing` and probably get rid of `enablePreviewSizedOutputBuffers`
    //       If `allowBufferResizing` is true, we can set `.videoSettings`/dimensions here to `options.targetResolution`
    //       and `targetResolution` to `.any` (to not participate in resolution negotiations).
    //       If `allowBufferResizing` is false, we don't set `.videoSettings` ("native" resolution), and reflect our
    //       target resolution via `targetResolution` to participate in resolution negotiations.
    if #available(iOS 17.0, *), options.enablePreviewSizedOutputBuffers {
      output.deliversPreviewSizedOutputBuffers = true
    }
    if #available(iOS 26.0, *) {
      // We don't need HDR metadata, as that's only useful for encoders.
      output.preservesDynamicHDRMetadata = false
    }
  }

  func configure(config: OutputConfiguration) {
    // TODO: Somehow attach this to `connection`, so we dont have race conditions
    //       where we read `self.mirrorMode` for an old Frame in `getMediaSampleMetadata`
    self.mirrorMode = config.mirrorMode

    guard let connection = output.connection(with: .video) else {
      return
    }
    if options.enablePhysicalBufferRotation {
      // Pipeline should physically rotate buffers on the `connection`
      try? connection.setOrientation(outputOrientation)
      try? connection.setMirrorMode(config.mirrorMode)
    }
    if options.enableCameraMatrixDelivery {
      // Pipeline should deliver camera matrix (via attachment on `CMSampleBuffer`)
      if connection.isCameraIntrinsicMatrixDeliverySupported {
        connection.isCameraIntrinsicMatrixDeliveryEnabled = true
      }
    }
  }

  private func videoSettingsForPixelFormat(_ targetPixelFormat: TargetVideoPixelFormat) -> [String:
    Any]
  {
    let pixelFormat = targetPixelFormat.toCVPixelFormatType()
    switch pixelFormat {
    case .native:
      // Empty dictionary means "choose device-native format" (most efficient)
      return [:]
    case .specific(let format):
      // Use a specific format (e.g. 32 BGRA)
      return [
        kCVPixelBufferPixelFormatTypeKey as String: format
      ]
    }
  }

  private func getMediaSampleMetadata(
    at timestamp: CMTime,
    orientation bufferOrientation: CameraOrientation,
    isMirrored isBufferMirrored: Bool
  ) -> MediaSampleMetadata {
    // `isMirrored` is relative; if the buffer is already mirrored & we want mirror, good.
    // If not, we need to counter-mirror.
    var isMirrored: Bool
    switch self.mirrorMode {
    case .auto:
      // We just follow along with what the connection gives us.
      isMirrored = false
    case .on:
      // We enabled mirroring. If the buffer is not mirrored, we need to mirror.
      isMirrored = isBufferMirrored == false
    case .off:
      // We disabled mirroring. If the buffer is mirrored, we need to counter-mirror.
      isMirrored = isBufferMirrored == true
    }
    // `orientation` is relative to the target output orientation.
    let relativeOrientation = bufferOrientation.relativeTo(self.outputOrientation)

    return MediaSampleMetadata(
      timestamp: timestamp,
      orientation: relativeOrientation,
      isMirrored: isMirrored,
      bufferOrientation: bufferOrientation,
      isBufferMirrored: isBufferMirrored)
  }

  func setOnFrameCallback(onFrame: ((any HybridFrameSpec) -> Bool)?) throws {
    guard DispatchQueue.getSpecific(key: self.queueSpecificKey) != nil else {
      throw RuntimeError.error(
        withMessage: "setOnFrameCallback(...) must be called on the FrameOutput's `thread`!")
    }
    if let onFrame {
      delegate.onFrame = { (sampleBuffer, timestamp, bufferOrientation, isBufferMirrored) in
        // Prepare Frame + Metadata
        let metadata = self.getMediaSampleMetadata(
          at: timestamp,
          orientation: bufferOrientation,
          isMirrored: isBufferMirrored)
        let frame = HybridFrame(
          buffer: sampleBuffer,
          metadata: metadata)
        // Call sync JS function
        _ = onFrame(frame)
      }
    } else {
      delegate.onFrame = nil
    }
  }

  func setOnFrameDroppedCallback(onFrameDropped: ((FrameDroppedReason) -> Void)?) throws {
    if let onFrameDropped {
      delegate.onFrameDropped = { sampleBuffer in
        guard let attachment = sampleBuffer.attachments[.droppedFrameReason] else {
          return
        }
        let reason = FrameDroppedReason(sampleBufferReason: attachment)
        onFrameDropped(reason)
      }
    } else {
      delegate.onFrameDropped = nil
    }
  }
}
