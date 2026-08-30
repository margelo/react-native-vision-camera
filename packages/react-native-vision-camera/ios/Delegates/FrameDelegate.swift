//
//  FrameDelegate.swift
//  VisionCamera
//
//  Created by Marc Rousavy on 05.11.25.
//

import AVFoundation
import Foundation

final class FrameDelegate: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  var onFrame: ((CMSampleBuffer, CMTime, CameraOrientation, Bool, CameraOrientation) -> Void)?
  var onFrameDropped: ((CMSampleBuffer) -> Void)?

  func captureOutput(
    _ output: AVCaptureOutput, didDrop sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    if let onFrameDropped {
      onFrameDropped(sampleBuffer)
    }
  }

  func captureOutput(
    _ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    if let onFrame {
      onFrame(
        sampleBuffer, sampleBuffer.presentationTimeStamp, connection.orientation,
        connection.isVideoMirrored, connection.physicalBufferRotation)
    }
  }
}
