//
//  FrameToCameraMatrix.swift
//  VisionCamera
//
//  Created by Marc Rousavy on 29.01.26.
//

import AVFoundation
import CoreGraphics

enum FrameCoordinateSystemConverter {
  /**
   * Get a Matrix that can convert a point in the
   * given `pixelBuffer` to normalized Camera coordinates
   * (`(cx, cy) ∈ [0, 1]²`).
   * The buffer's physical orientation and mirroring affect
   * the Matrix if the `Frame` needs those to be adjusted.
   */
  static func getFrameToCameraMatrix(
    pixelBuffer: CVPixelBuffer,
    bufferOrientation: CameraOrientation,
    isBufferMirrored: Bool
  ) -> CGAffineTransform {
    var matrix = CGAffineTransform.identity

    // AVFoundation Camera coordinates use the unrotated sensor image, which is always
    // landscape-right (home button on the right). In CameraOrientation, this is `.left`.
    let sensorRelativeOrientation = bufferOrientation.relativeTo(.left)

    // 1. Rotate from the Pixel Buffer's orientation into the sensor's orientation
    switch sensorRelativeOrientation {
    case .up:
      break
    case .down:
      matrix =
        matrix
        .translatedBy(x: 1, y: 1)
        .rotated(by: .pi)
    case .left:
      matrix =
        matrix
        .translatedBy(x: 1, y: 0)
        .rotated(by: .pi / 2)
    case .right:
      matrix =
        matrix
        .translatedBy(x: 0, y: 1)
        .rotated(by: -.pi / 2)
    }

    // 2. If the Pixel Buffer is mirrored, counter-mirror our Matrix
    if isBufferMirrored {
      let mirror = CGAffineTransform.identity
        .translatedBy(x: 1, y: 0)
        .scaledBy(x: -1, y: 1)
      matrix = mirror.concatenating(matrix)
    }

    // 3. Our Matrix is in [0, 1], so let's scale it to [0, width|height] now
    let width = CGFloat(CVPixelBufferGetWidth(pixelBuffer))
    let height = CGFloat(CVPixelBufferGetHeight(pixelBuffer))
    matrix = matrix.scaledBy(x: 1 / width, y: 1 / height)

    return matrix
  }

  static func getCameraToFrameMatrix(
    pixelBuffer: CVPixelBuffer,
    bufferOrientation: CameraOrientation,
    isBufferMirrored: Bool
  ) -> CGAffineTransform {
    let frameToCameraMatrix = getFrameToCameraMatrix(
      pixelBuffer: pixelBuffer,
      bufferOrientation: bufferOrientation,
      isBufferMirrored: isBufferMirrored)
    return frameToCameraMatrix.inverted()
  }
}
