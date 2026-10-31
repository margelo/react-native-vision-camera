///
/// HybridCameraVideoOutput.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules

final class HybridCameraVideoOutput: HybridCameraVideoOutputSpec, NativeCameraOutput {
  private let queue = DispatchQueue(label: "com.margelo.camera.video")
  private let options: VideoOutputOptions
  private let fileType: RecorderFileType
  let mediaType: MediaType = .video
  let output: AVCaptureMovieFileOutput
  var requiresAudioInput: Bool {
    return options.enableAudio == true
  }
  let requiresDepthFormat: Bool = false
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

  var streamType: StreamType = .video
  var targetResolution: ResolutionRule {
    return .closestTo(options.targetResolution)
  }

  init(options: VideoOutputOptions) {
    self.output = AVCaptureMovieFileOutput()
    self.options = options
    self.fileType = options.fileType ?? .mov
    super.init()
    self.setMetadataTag(.libraryTag)
  }

  private func setMetadataTag(_ tag: AVMetadataItem) {
    // Get metadata (or empty array)
    var metadata = self.output.metadata ?? []
    // Remove all items with the same key
    metadata.removeAll { item in
      guard let itemKey = item.key as? NSString,
        let tagKey = tag.key as? NSString
      else { return false }
      return item.keySpace == tag.keySpace && itemKey == tagKey
    }
    // add the new tag
    metadata.append(tag)
    self.output.metadata = metadata
  }

  func configure(config: OutputConfiguration) {
    guard let connection = output.connection(with: .video) else {
      return
    }
    try? connection.setOrientation(outputOrientation)
    try? connection.setMirrorMode(config.mirrorMode)

    if let targetBitRate = options.targetBitRate {
      self.setBitRate(bitRate: Int(targetBitRate), for: connection)
    }
  }

  func getSupportedVideoCodecs() throws -> [VideoCodec] {
    guard output.connection(with: .video) != nil else {
      throw RuntimeError.error(
        withMessage:
          "Cannot call `getSupportedVideoCodecs()` when VideoOutput is not yet connected to the CameraSession!"
      )
    }
    return output.availableVideoCodecTypes.map { VideoCodec(avCodec: $0) }
  }

  func setOutputSettings(settings: VideoOutputSettings) -> Promise<Void> {
    return Promise.parallel(queue) {
      guard let connection = self.output.connection(with: .video) else {
        throw RuntimeError.error(
          withMessage:
            "Cannot set output settings when VideoOutput is not yet connected to the CameraSession!"
        )
      }

      if let codec = settings.codec {
        if codec.isRawCodec {
          guard self.options.targetBitRate == nil else {
            throw RuntimeError.error(
              withMessage:
                "Cannot set bit-rate when recording in a RAW codec! (\(codec.stringValue))")
          }
        }

        let avCodec = try codec.toAVVideoCodecType()
        guard self.output.availableVideoCodecTypes.contains(avCodec) else {
          throw RuntimeError.error(
            withMessage:
              "Video codec \(codec.stringValue) is not supported by this device! "
              + "Supported codecs: \(self.output.availableVideoCodecTypes.map(\.rawValue))")
        }

        if let bitRate = self.options.targetBitRate {
          self.setOutputSettings(
            bitRate: Int(bitRate),
            codec: avCodec,
            for: connection)
        } else {
          self.setOutputSettings(
            codec: avCodec,
            for: connection)
        }
      }
    }
  }

  func createRecorder(settings: RecorderSettings) -> Promise<any HybridRecorderSpec> {
    return Promise.parallel(queue) {
      if let hybridLocation = settings.location {
        guard let location = hybridLocation as? any NativeLocation else {
          throw RuntimeError.error(withMessage: "Location is not of type `NativeLocation`!")
        }
        let metadataItem = try location.location.toAVMutableMetadataItem()
        self.setMetadataTag(metadataItem)
      }
      return try HybridVideoRecorder(
        videoOutput: self.output,
        queue: self.queue,
        fileType: self.fileType,
        settings: settings)
    }
  }

  private func setBitRate(bitRate: Int, for connection: AVCaptureConnection) {
    let currentSettings = output.outputSettings(for: connection)
    let currentCodec = currentSettings[AVVideoCodecKey] as? AVVideoCodecType ?? AVVideoCodecType.hevc

    // A `targetBitRate` is a request for a compressed codec. On a format whose
    // default movie codec is ProRes (the 10-bit 4:2:2 formats of Pro iPhones)
    // the connection reports that codec and does not list compression
    // properties, so applying the bit-rate to the current codec silently keeps
    // ProRes and the recorder writes ~250 Mbps. Keep HEVC or H.264 when the
    // connection already holds one; otherwise move to the first the output
    // offers (HEVC, else H.264). With neither, leave the connection untouched:
    // setting a codec the output does not offer raises.
    guard let codec = compressedCodec(preferring: currentCodec) else {
      logger.error("No compressed video codec is available - cannot use custom bit-rate!")
      return
    }
    setOutputSettings(bitRate: bitRate, codec: codec, for: connection)
  }

  private func compressedCodec(preferring currentCodec: AVVideoCodecType) -> AVVideoCodecType? {
    // An allow-list, not a ProRes deny-list: any other codec (one the converter
    // does not know, or JPEG) would drop the bit-rate the same way ProRes did.
    let compressed: [AVVideoCodecType] = [.hevc, .h264]
    let available = output.availableVideoCodecTypes
    if compressed.contains(currentCodec) && available.contains(currentCodec) {
      return currentCodec
    }
    return compressed.first { available.contains($0) }
  }

  private func setOutputSettings(bitRate: Int, codec: AVVideoCodecType, for connection: AVCaptureConnection) {
    // Apply the codec on its own first: the supported keys are reported for the
    // connection's current codec, and a ProRes connection does not list
    // compression properties until it has been moved to a compressed codec.
    setOutputSettings(codec: codec, for: connection)
    let supportedKeys = output.supportedOutputSettingsKeys(for: connection)
    guard supportedKeys.contains(AVVideoCompressionPropertiesKey) else {
      logger.error(
        "Setting `AVVideoCompressionPropertiesKey` is not supported - cannot use custom bit-rate!")
      return
    }

    let settings: [String: Any] = [
      AVVideoCodecKey: codec,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: bitRate
          // ..the remaining AVVideoCompressionPropertiesKey values will be filled by AVFoundation
      ],
    ]
    output.setOutputSettings(settings, for: connection)
  }

  private func setOutputSettings(codec: AVVideoCodecType, for connection: AVCaptureConnection) {
    let settings: [String: Any] = [AVVideoCodecKey: codec]
    output.setOutputSettings(settings, for: connection)
  }
}
