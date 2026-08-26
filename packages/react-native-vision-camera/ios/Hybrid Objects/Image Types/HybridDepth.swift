//
//  HybridDepth.swift
//  VisionCamera
//
//  Created by Marc Rousavy on 29.10.25.
//

import AVFoundation
import Foundation
import NitroModules

final class HybridDepth: HybridDepthSpec, NativeDepth, LazyLockableBuffer {
  var depthData: AVDepthData?
  let metadata: MediaSampleMetadata
  var isLocked: Bool = false
  var pixelBuffer: CVPixelBuffer? {
    return depthData?.depthDataMap
  }

  init(
    depthData: AVDepthData,
    metadata: MediaSampleMetadata
  ) {
    self.depthData = depthData
    self.metadata = metadata
    super.init()
  }

  func dispose() {
    unlockBuffer()
    depthData = nil
  }

  var memorySize: Int {
    return pixelBuffer?.memorySize ?? 0
  }

  var isValid: Bool {
    return depthData != nil
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

  var timestamp: Double {
    return metadata.timestamp.seconds
  }
  var orientation: CameraOrientation {
    return metadata.orientation
  }
  var isMirrored: Bool {
    return metadata.isMirrored
  }

  var pixelFormat: DepthPixelFormat {
    guard let depthData else {
      return .unknown
    }
    return DepthPixelFormat(osType: depthData.depthDataType)
  }

  var isDepthDataFiltered: Bool {
    return depthData?.isDepthDataFiltered ?? false
  }

  var depthDataAccuracy: DepthDataAccuracy {
    guard let depthData else {
      return .unknown
    }
    return DepthDataAccuracy(av: depthData.depthDataAccuracy)
  }

  var depthDataQuality: DepthDataQuality {
    guard let depthData else {
      return .unknown
    }
    return DepthDataQuality(av: depthData.depthDataQuality)
  }

  var availableDepthPixelFormats: [DepthPixelFormat] {
    guard let depthData else {
      return []
    }
    return depthData.availableDepthDataTypes.map { DepthPixelFormat(osType: $0) }
  }

  var cameraCalibrationData: (any HybridCameraCalibrationDataSpec)? {
    guard let depthData,
      let calibrationData = depthData.cameraCalibrationData
    else {
      return nil
    }
    return HybridCameraCalibrationData(calibrationData: calibrationData)
  }

  func rotate(orientation: CameraOrientation, isMirrored: Bool) throws -> any HybridDepthSpec {
    guard let depthData else {
      throw RuntimeError.error(withMessage: "Tried to rotate an already disposed Depth!")
    }
    let cgOrientation = orientation.toCGOrientation(isMirrored: isMirrored)
    let rotated = depthData.applyingExifOrientation(cgOrientation)
    return HybridDepth(
      depthData: rotated,
      metadata: metadata)
  }

  func rotateAsync(orientation: CameraOrientation, isMirrored: Bool) throws -> Promise<
    any HybridDepthSpec
  > {
    return Promise.async {
      return try self.rotate(orientation: orientation, isMirrored: isMirrored)
    }
  }

  func convert(pixelFormat: DepthPixelFormat) throws -> any HybridDepthSpec {
    guard let depthData else {
      throw RuntimeError.error(withMessage: "Tried to convert an already disposed Depth!")
    }
    let osFormat = try pixelFormat.toCVPixelFormatType()
    let converted = depthData.converting(toDepthDataType: osFormat)
    return HybridDepth(
      depthData: converted,
      metadata: metadata)
  }

  func convertAsync(pixelFormat: DepthPixelFormat) throws -> Promise<any HybridDepthSpec> {
    return Promise.async {
      return try self.convert(pixelFormat: pixelFormat)
    }
  }

  func convertCameraPointToDepthPoint(cameraPoint: Point) throws -> Point {
    guard let pixelBuffer else {
      throw RuntimeError.error(withMessage: "This Depth has already been disposed!")
    }
    let matrix = FrameCoordinateSystemConverter.getCameraToFrameMatrix(
      pixelBuffer: pixelBuffer,
      bufferOrientation: metadata.bufferOrientation,
      isBufferMirrored: metadata.isBufferMirrored)
    return cameraPoint.applying(matrix)
  }

  func convertDepthPointToCameraPoint(depthPoint: Point) throws -> Point {
    guard let pixelBuffer else {
      throw RuntimeError.error(withMessage: "This Depth has already been disposed!")
    }
    let matrix = FrameCoordinateSystemConverter.getFrameToCameraMatrix(
      pixelBuffer: pixelBuffer,
      bufferOrientation: metadata.bufferOrientation,
      isBufferMirrored: metadata.isBufferMirrored)
    return depthPoint.applying(matrix)
  }

  func getDepthData() throws -> ArrayBuffer {
    guard let depthData else {
      throw RuntimeError.error(withMessage: "Cannot get an already disposed Depth Frame's data!")
    }
    try ensureBufferLocked()
    return try ArrayBuffer.fromPixelBuffer(depthData.depthDataMap)
  }

  func getNativeBuffer() throws -> NativeBuffer {
    guard let pixelBuffer else {
      throw RuntimeError.error(withMessage: "This Depth has already been disposed!")
    }
    return pixelBuffer.asNativeBuffer()
  }

  func toFrame() throws -> any HybridFrameSpec {
    guard let depthData else {
      throw RuntimeError.error(withMessage: "Cannot convert an already disposed Depth to a Frame!")
    }
    let format = try CMFormatDescription(imageBuffer: depthData.depthDataMap)
    let timing = CMSampleTimingInfo(
      duration: .zero,
      presentationTimeStamp: metadata.timestamp,
      decodeTimeStamp: .zero)
    let sampleBuffer = try CMSampleBuffer(
      imageBuffer: depthData.depthDataMap,
      formatDescription: format,
      sampleTiming: timing)
    return HybridFrame(
      buffer: sampleBuffer,
      metadata: metadata)
  }
  func toFrameAsync() -> Promise<any HybridFrameSpec> {
    return Promise.async {
      return try self.toFrame()
    }
  }
}
