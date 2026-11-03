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
  let physicalBufferRotation: CameraOrientation
  let isPhysicalBufferMirrored: Bool

  init(timestamp: CMTime, orientationFromOutput output: AVCaptureOutput) throws {
    guard let connection = output.connection(with: .video) else {
      throw RuntimeError.error(withMessage: "Output \(output) does not have a video connection!")
    }
    self.init(timestamp: timestamp, orientationFromConnection: connection)
  }
  init(timestamp: CMTime, orientationFromConnection connection: AVCaptureConnection) {
    let isMirrored = connection.isVideoMirrored
    self.init(
      timestamp: timestamp,
      orientation: connection.orientation,
      isMirrored: isMirrored,
      physicalBufferRotation: connection.physicalBufferRotation,
      isPhysicalBufferMirrored: isMirrored)
  }
  init(timestamp: CMTime, orientation: CameraOrientation, isMirrored: Bool) {
    self.init(
      timestamp: timestamp,
      orientation: orientation,
      isMirrored: isMirrored,
      physicalBufferRotation: orientation,
      isPhysicalBufferMirrored: isMirrored)
  }
  init(
    timestamp: CMTime,
    orientation: CameraOrientation,
    isMirrored: Bool,
    physicalBufferRotation: CameraOrientation,
    isPhysicalBufferMirrored: Bool
  ) {
    self.timestamp = timestamp
    self.orientation = orientation
    self.isMirrored = isMirrored
    self.physicalBufferRotation = physicalBufferRotation
    self.isPhysicalBufferMirrored = isPhysicalBufferMirrored
  }

  var uiImageOrientation: UIImage.Orientation {
    return orientation.toUIImageOrientation(isMirrored: isMirrored)
  }
}
