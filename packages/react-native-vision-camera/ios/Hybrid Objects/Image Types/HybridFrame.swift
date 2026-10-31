//
//  HybridFrame.swift
//  VisionCamera
//
//  Created by Marc Rousavy on 29.10.25.
//

import AVFoundation
import Foundation
import NitroModules

final class HybridFrame: HybridFrameSpec, NativeFrame, LazyLockableBuffer {
  var sampleBuffer: CMSampleBuffer?
  let metadata: MediaSampleMetadata
  var isLocked: Bool = false
  private var planesCached: [HybridFramePlane]?
  var pixelBuffer: CVPixelBuffer? {
    return sampleBuffer?.imageBuffer
  }

  init(
    buffer: CMSampleBuffer,
    metadata: MediaSampleMetadata
  ) {
    self.sampleBuffer = buffer
    self.metadata = metadata
    self.planesCached = nil
    super.init()
  }

  var memorySize: Int {
    return pixelBuffer?.memorySize ?? 0
  }

  var timestamp: Double {
    return metadata.timestamp.seconds
  }
  var isMirrored: Bool {
    return metadata.isMirrored
  }
  var orientation: CameraOrientation {
    return metadata.orientation
  }

  var width: Double {
    guard let pixelBuffer else {
      return 0
    }
    return Double(CVPixelBufferGetWidth(pixelBuffer))
  }

  var height: Double {
    guard let pixelBuffer else {
      return 0
    }
    return Double(CVPixelBufferGetHeight(pixelBuffer))
  }

  var bytesPerRow: Double {
    guard let pixelBuffer else {
      return 0
    }
    return Double(CVPixelBufferGetBytesPerRow(pixelBuffer))
  }

  var isValid: Bool {
    return sampleBuffer?.isValid ?? false
  }

  var isPlanar: Bool {
    guard let pixelBuffer else {
      return false
    }
    return CVPixelBufferIsPlanar(pixelBuffer)
  }

  var hasPixelBuffer: Bool {
    return pixelBuffer != nil
  }

  var hasNativeBuffer: Bool {
    return pixelBuffer != nil
  }

  var pixelFormat: PixelFormat {
    guard let pixelBuffer else {
      return .unknown
    }
    let osType = CVPixelBufferGetPixelFormatType(pixelBuffer)
    return PixelFormat(osType: osType)
  }

  lazy var cameraIntrinsicMatrix: [Double]? = {
    guard let sampleBuffer else {
      return nil
    }
    guard let matrix = sampleBuffer.getCameraIntrinsicMatrix() else {
      return nil
    }
    return matrix.toDoubleArray()
  }()

  func dispose() {
    self.unlockBuffer()
    try? self.sampleBuffer?.invalidate()
    self.sampleBuffer = nil
    self.planesCached?.forEach { $0.dispose() }
  }

  func getPlanes() throws -> [any HybridFramePlaneSpec] {
    guard isValid else {
      throw RuntimeError.error(withMessage: "This Frame has already been disposed!")
    }
    guard let pixelBuffer else {
      throw RuntimeError.error(withMessage: "This Frame does not contain a Pixel Buffer!")
    }
    if let planesCached {
      // we have planes cached
      return planesCached
    }
    try ensureBufferLocked()
    let planeCount = CVPixelBufferGetPlaneCount(pixelBuffer)
    let planes = (0..<planeCount).map { index in
      HybridFramePlane(buffer: pixelBuffer, planeIndex: index)
    }
    self.planesCached = planes
    return planes
  }

  func getPixelBuffer() throws -> ArrayBuffer {
    guard isValid else {
      throw RuntimeError.error(withMessage: "This Frame has already been disposed!")
    }
    guard let pixelBuffer else {
      throw RuntimeError.error(withMessage: "This Frame does not contain a Pixel Buffer!")
    }
    try ensureBufferLocked()
    return try ArrayBuffer.fromPixelBuffer(pixelBuffer)
  }

  func getNativeBuffer() throws -> NativeBuffer {
    guard let pixelBuffer else {
      throw RuntimeError.error(withMessage: "This Frame does not contain a Pixel Buffer!")
    }
    return pixelBuffer.asNativeBuffer()
  }

  func convertCameraPointToFramePoint(cameraPoint: Point) throws -> Point {
    guard let pixelBuffer else {
      throw RuntimeError.error(withMessage: "This Frame has already been disposed!")
    }
    let matrix = FrameCoordinateSystemConverter.getCameraToFrameMatrix(
      pixelBuffer: pixelBuffer,
      orientation: metadata.physicalBufferRotation,
      isMirrored: metadata.isPhysicalBufferMirrored)
    return cameraPoint.applying(matrix)
  }

  func convertFramePointToCameraPoint(framePoint: Point) throws -> Point {
    guard let pixelBuffer else {
      throw RuntimeError.error(withMessage: "This Frame has already been disposed!")
    }
    let matrix = FrameCoordinateSystemConverter.getFrameToCameraMatrix(
      pixelBuffer: pixelBuffer,
      orientation: metadata.physicalBufferRotation,
      isMirrored: metadata.isPhysicalBufferMirrored)
    return framePoint.applying(matrix)
  }
}
