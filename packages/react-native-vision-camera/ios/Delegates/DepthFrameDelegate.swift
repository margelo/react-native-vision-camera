//
//  DepthFrameDelegate.swift
//  VisionCamera
//
//  Created by Marc Rousavy on 05.11.25.
//

import AVFoundation
import Foundation

final class DepthFrameDelegate: NSObject, AVCaptureDepthDataOutputDelegate {
  var onDepthFrame: ((AVDepthData, CMTime, CameraOrientation, Bool) -> Void)?
  var onDepthFrameDropped: ((AVCaptureOutput.DataDroppedReason) -> Void)?

  func depthDataOutput(
    _ output: AVCaptureDepthDataOutput, didDrop depthData: AVDepthData, timestamp: CMTime,
    connection: AVCaptureConnection, reason: AVCaptureOutput.DataDroppedReason
  ) {
    if let onDepthFrameDropped {
      onDepthFrameDropped(reason)
    }
  }

  func depthDataOutput(
    _ output: AVCaptureDepthDataOutput, didOutput depthData: AVDepthData, timestamp: CMTime,
    connection: AVCaptureConnection
  ) {
    if let onDepthFrame {
      onDepthFrame(depthData, timestamp, connection.bufferOrientation, connection.isVideoMirrored)
    }
  }
}
