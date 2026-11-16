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

  init(timestamp: CMTime, orientationFromOutput output: AVCaptureOutput) throws {
    guard let connection = output.connection(with: .video) else {
      throw RuntimeError.error(withMessage: "Output \(output) does not have a video connection!")
    }
    self.init(timestamp: timestamp, orientationFromConnection: connection)
  }
  init(timestamp: CMTime, orientationFromConnection connection: AVCaptureConnection) {
    self.timestamp = timestamp
    self.orientation = connection.bufferOrientation
    self.isMirrored = connection.isVideoMirrored
  }
  init(timestamp: CMTime, orientation: CameraOrientation, isMirrored: Bool) {
    self.timestamp = timestamp
    self.orientation = orientation
    self.isMirrored = isMirrored
  }

  var uiImageOrientation: UIImage.Orientation {
    return orientation.toUIImageOrientation(isMirrored: isMirrored)
  }
}
