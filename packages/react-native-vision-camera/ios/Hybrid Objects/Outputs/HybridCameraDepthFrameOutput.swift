///
/// HybridCameraDepthFrameOutput.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules

final class HybridCameraDepthFrameOutput: HybridCameraDepthFrameOutputSpec, NativeCameraOutput {
  private let delegate: DepthFrameDelegate
  private let queue: DispatchQueue
  private let queueSpecificKey = DispatchSpecificKey<Void>()
  private let options: DepthFrameOutputOptions
  private var mirrorMode: MirrorMode = .auto
  let mediaType: MediaType = .depth
  let requiresAudioInput: Bool = false
  let requiresDepthFormat: Bool = true
  let output: AVCaptureDepthDataOutput
  lazy var thread: any HybridNativeThreadSpec = {
    return HybridNativeThread(queue: queue)
  }()

  var outputOrientation: CameraOrientation = .up {
    didSet {
      guard let connection = output.connection(with: .depthData) else { return }
      if options.enablePhysicalBufferRotation {
        // TODO: Should we apply that within the CameraSession's DispatchQueue? Batch it?
        try? connection.setOrientation(outputOrientation)
      }
    }
  }
  var currentResolution: Size? {
    guard let connection = output.connection(with: .depthData) else { return nil }
    return connection.inputStreamResolution
  }

  var streamType: StreamType = .depthVideo
  var targetResolution: ResolutionRule {
    return .closestTo(options.targetResolution)
  }

  init(options: DepthFrameOutputOptions) {
    self.output = AVCaptureDepthDataOutput()
    self.delegate = DepthFrameDelegate()
    self.options = options
    self.queue = DispatchQueue(
      label: "com.margelo.camera.depth",
      qos: .userInteractive,
      attributes: [],
      autoreleaseFrequency: .inherit,
      target: nil)
    self.queue.setSpecific(key: queueSpecificKey, value: ())
    super.init()

    // Set up our `delegate`
    output.setDelegate(delegate, callbackQueue: queue)
    // Configure `videoSettings`
    output.alwaysDiscardsLateDepthData = options.dropFramesWhileBusy
    output.isFilteringEnabled = options.enableFiltering
    if #available(iOS 26.0, *), output.isDeferredStartSupported {
      // Deferred start allows the Session to delay this output's startup in favor
      // of preview-related outputs to make preview appear faster.
      output.isDeferredStartEnabled = options.allowDeferredStart
    }
  }

  func configure(config: OutputConfiguration) {
    // TODO: Somehow attach this to `connection`, so we dont have race conditions
    //       where we read `self.mirrorMode` for an old Frame in `getMediaSampleMetadata`
    self.mirrorMode = config.mirrorMode

    guard let connection = output.connection(with: .depthData) else {
      return
    }
    if options.enablePhysicalBufferRotation {
      // Pipeline should physically rotate buffers on the `connection`
      try? connection.setOrientation(outputOrientation)
      try? connection.setMirrorMode(config.mirrorMode)
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

  func setOnDepthFrameCallback(onDepthFrame: ((any HybridDepthSpec) -> Bool)?) throws {
    guard DispatchQueue.getSpecific(key: self.queueSpecificKey) != nil else {
      throw RuntimeError.error(
        withMessage:
          "setOnDepthFrameCallback(...) must be called on the DepthFrameOutput's `thread`!")
    }
    if let onDepthFrame {
      delegate.onDepthFrame = { (depth, timestamp, bufferOrientation, isBufferMirrored) in
        // Prepare Depth Frame + Metadata
        let metadata = self.getMediaSampleMetadata(
          at: timestamp,
          orientation: bufferOrientation,
          isMirrored: isBufferMirrored)
        let depth = HybridDepth(
          depthData: depth,
          metadata: metadata)
        // Call sync JS function
        _ = onDepthFrame(depth)
      }
    } else {
      delegate.onDepthFrame = nil
    }
  }

  func setOnDepthFrameDroppedCallback(onDepthFrameDropped: ((FrameDroppedReason) -> Void)?) throws {
    if let onDepthFrameDropped {
      delegate.onDepthFrameDropped = { avReason in
        let reason = FrameDroppedReason(reason: avReason)
        onDepthFrameDropped(reason)
      }
    } else {
      delegate.onDepthFrameDropped = nil
    }
  }
}
