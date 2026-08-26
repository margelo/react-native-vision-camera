//
//  MediaSampleMetadata.swift
//  VisionCamera
//
//  Created by Marc Rousavy on 29.10.25.
//

import AVFoundation
import Foundation
import NitroModules
import UIKit

public struct MediaSampleMetadata {
  let timestamp: CMTime
  let orientation: CameraOrientation
  let isMirrored: Bool
  let bufferOrientation: CameraOrientation
  let isBufferMirrored: Bool

  init(timestamp: CMTime, orientationFromOutput output: AVCaptureOutput) throws {
    guard let connection = output.connection(with: .video) else {
      throw RuntimeError.error(withMessage: "Output \(output) does not have a video connection!")
    }
    self.init(timestamp: timestamp, orientationFromConnection: connection)
  }
  init(timestamp: CMTime, orientationFromConnection connection: AVCaptureConnection) {
    let bufferOrientation = connection.orientation
    let isBufferMirrored = connection.isVideoMirrored
    self.init(
      timestamp: timestamp,
      orientation: bufferOrientation,
      isMirrored: isBufferMirrored,
      bufferOrientation: bufferOrientation,
      isBufferMirrored: isBufferMirrored)
  }
  init(timestamp: CMTime, orientation: CameraOrientation, isMirrored: Bool) {
    self.init(
      timestamp: timestamp,
      orientation: orientation,
      isMirrored: isMirrored,
      // This initializer has no AVCaptureConnection to expose the physical buffer state.
      // Preserve the previous relative-orientation transform for callers such as Photo depth data.
      bufferOrientation: orientation.rotatedBy(.left),
      isBufferMirrored: isMirrored)
  }
  init(
    timestamp: CMTime,
    orientation: CameraOrientation,
    isMirrored: Bool,
    bufferOrientation: CameraOrientation,
    isBufferMirrored: Bool
  ) {
    self.timestamp = timestamp
    self.orientation = orientation
    self.isMirrored = isMirrored
    self.bufferOrientation = bufferOrientation
    self.isBufferMirrored = isBufferMirrored
  }

  var uiImageOrientation: UIImage.Orientation {
    return orientation.toUIImageOrientation(isMirrored: isMirrored)
  }
}
