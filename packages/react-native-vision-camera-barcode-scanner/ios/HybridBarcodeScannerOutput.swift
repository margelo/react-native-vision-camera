//
//  HybridBarcodeScannerOutput.swift
//  VisionCameraBarcodeScanner
//
//  Created by Marc Rousavy on 08.02.26.
//

import AVFoundation
import MLKitBarcodeScanning
import MLKitVision
import NitroModules
import VisionCamera

final class HybridBarcodeScannerOutput: HybridCameraOutputSpec, NativeCameraOutput {
  private let scanner: BarcodeScanner
  private let onBarcodeScanned: (_ barcodes: [any HybridBarcodeSpec]) -> Void
  private let onError: (_ error: Error) -> Void
  private var isScanning = false
  private var delegate: BarcodeScannerDelegate? = nil
  private let queue: DispatchQueue
  let output: AVCaptureVideoDataOutput
  let requiresAudioInput: Bool = false
  let requiresDepthFormat: Bool = false
  let mediaType: MediaType = .video
  var outputOrientation: CameraOrientation = .up
  var currentResolution: Size? {
    guard let connection = output.connection(with: .video) else { return nil }
    return connection.inputStreamResolution
  }

  let streamType: StreamType = .video
  var targetResolution: ResolutionRule {
    // TODO: Is this a good size for ML? Lower? Higher?
    //       Maybe a good point to refactor the resolution/format
    //       negotiation in the Constraint system - not sure if all
    //       CameraOutputs should participate in negotiating sizes?
    return .closestTo(Size(width: 720.0, height: 1280.0))
  }

  init(options: BarcodeScannerOutputOptions) {
    self.scanner = BarcodeScanner.barcodeScanner(options: options.toMLKitOptions())
    self.onBarcodeScanned = options.onBarcodeScanned
    self.onError = options.onError
    self.queue = DispatchQueue(label: "com.margelo.camera.barcodescanner")
    self.output = AVCaptureVideoDataOutput()
    super.init()

    // set delegate
    self.delegate = BarcodeScannerDelegate(onSampleBuffer: { [weak self] buffer in
      self?.scan(buffer)
    })
    self.output.setSampleBufferDelegate(delegate, queue: queue)
    self.output.alwaysDiscardsLateVideoFrames = true
    if #available(iOS 26.0, *), output.isDeferredStartSupported {
      // Deferred start allows the session to delay this output's startup in favor
      // of preview-related outputs to make preview appear faster.
      output.isDeferredStartEnabled = true
    }
    if #available(iOS 17.0, *), options.outputResolution != .full {
      self.output.automaticallyConfiguresOutputBufferDimensions = false
      self.output.deliversPreviewSizedOutputBuffers = true
    }
  }

  private func scan(_ buffer: CMSampleBuffer) {
    if isScanning { return }

    // prepare MLImage
    isScanning = true
    guard let image = MLImage(sampleBuffer: buffer) else {
      isScanning = false
      onError(RuntimeError.error(withMessage: "Failed to convert CMSampleBuffer to MLImage!"))
      return
    }
    image.orientation = outputOrientation.toUIImageOrientation()
    // start scanning
    scanner.process(image) { [weak self] barcodes, error in
      guard let self else { return }
      self.isScanning = false
      if let barcodes {
        // scanned x barcodes!
        let hybridBarcodes: [any HybridBarcodeSpec] = barcodes.map { HybridBarcode(barcode: $0) }
        self.onBarcodeScanned(hybridBarcodes)
      }
      if let error {
        // error
        self.onError(error)
      }
    }
  }

  func configure(config: OutputConfiguration) {
    guard let connection = self.output.connection(with: .video) else {
      return
    }
    connection.preferredVideoStabilizationMode = .off
  }
}
