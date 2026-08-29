///
/// HybridCameraObjectOutput.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules

final class HybridCameraObjectOutput: HybridCameraObjectOutputSpec, NativeCameraOutput {
  private let queue = DispatchQueue(label: "com.margelo.camera.object-scanner")
  private let delegate: MetadataDelegate
  private let options: ObjectOutputOptions
  let mediaType: MediaType = .metadata
  let output: AVCaptureMetadataOutput
  let requiresAudioInput: Bool = false
  let requiresDepthFormat: Bool = false
  var outputOrientation: CameraOrientation = .up {
    didSet {
      guard let connection = output.connection(with: .metadataObject) else { return }
      // TODO: Should we apply that within the CameraSession's DispatchQueue? Batch it?
      try? connection.setOrientation(outputOrientation)
    }
  }
  var currentResolution: Size? {
    guard let connection = output.connection(with: .metadataObject) else { return nil }
    return connection.inputStreamResolution
  }

  var streamType: StreamType = .video
  var targetResolution: ResolutionRule = .any

  init(options: ObjectOutputOptions) {
    self.options = options
    self.output = AVCaptureMetadataOutput()
    self.delegate = MetadataDelegate()

    if #available(iOS 26.0, *), output.isDeferredStartSupported {
      // Deferred start allows the session to delay this output's startup in favor
      // of preview-related outputs to make preview appear faster.
      output.isDeferredStartEnabled = true
    }

    output.setMetadataObjectsDelegate(delegate, queue: queue)
  }

  func configure(config: OutputConfiguration) {
    guard let connection = output.connection(with: .metadataObject) else {
      return
    }
    try? connection.setOrientation(outputOrientation)
    try? connection.setMirrorMode(config.mirrorMode)

    // Enable all the types that are supported
    let filteredObjectTypes = options.enabledObjectTypes
      .compactMap { $0.toAVMetadataObjectType() }
      .filter { output.availableMetadataObjectTypes.contains($0) }
    output.metadataObjectTypes = filteredObjectTypes
  }

  func setOnObjectsScannedCallback(onObjectsScanned: (([any HybridScannedObjectSpec]) -> Void)?)
    throws
  {
    if let onObjectsScanned {
      delegate.onMetadataObjects = { objects in
        let metadatas = objects.map { Self.createHybridScannedObject(from: $0) }
        onObjectsScanned(metadatas)
      }
    } else {
      delegate.onMetadataObjects = nil
    }
  }

  static func createHybridScannedObject(from object: AVMetadataObject)
    -> any HybridScannedObjectSpec
  {
    switch object {
    case let code as AVMetadataMachineReadableCodeObject:
      // Code
      return HybridScannedCode(object: code)
    case let face as AVMetadataFaceObject:
      // Face
      return HybridScannedFace(object: face)
    default:
      // Any other AVMetadataObject
      return HybridScannedObject(object: object)
    }
  }
}
