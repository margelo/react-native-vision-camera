///
/// AVCaptureConnection+orientation.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules

extension AVCaptureConnection {
  var orientation: CameraOrientation {
    return CameraOrientation(avOrientation: videoOrientation)
  }

  /**
   * The orientation of the buffers this connection delivers,
   * i.e. the rotation that turns them upright before any mirroring.
   *
   * AVFoundation names a front camera's `videoOrientation` after its
   * mirrored (selfie) image: its data outputs report `landscapeLeft`
   * while their un-mirrored buffers are laid out like the back camera's
   * `landscapeRight` ones. So when the connection does not mirror its
   * buffers, the front camera's quarter turns are inverted.
   */
  var bufferOrientation: CameraOrientation {
    let isFrontCamera = deviceInput?.device.position == .front
    return CameraOrientation.bufferOrientation(
      reportedOrientation: orientation,
      isFrontCamera: isFrontCamera,
      isVideoMirrored: isVideoMirrored)
  }

  func setOrientation(_ orientation: CameraOrientation) throws {
    guard self.isVideoOrientationSupported else {
      throw RuntimeError.error(
        withMessage:
          "Cannot set orientation=\"\(orientation.stringValue)\" - this connection does not support orientation changing"
      )
    }
    self.videoOrientation = orientation.toAVCaptureVideoOrientation()
  }
}
