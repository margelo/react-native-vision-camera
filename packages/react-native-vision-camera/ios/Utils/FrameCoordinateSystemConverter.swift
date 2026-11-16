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
   * The `orientation` and `isMirrored` flags affect the
   * Matrix if the `Frame` needs those to be adjusted.
   */
  static func getFrameToCameraMatrix(
    pixelBuffer: CVPixelBuffer,
    orientation: CameraOrientation,
    isMirrored: Bool
  ) -> CGAffineTransform {
    var matrix = CGAffineTransform.identity

    // 1. Counter-rotate by the orientation to get it up-right.
    //    The mirror below is applied first (in the buffer), and a mirror
    //    inverts a rotation, so a mirrored orientation is inverted.
    switch isMirrored ? orientation.inverted : orientation {
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

    // 2. If the Frame is mirrored, counter-mirror our Matrix
    if isMirrored {
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
    orientation: CameraOrientation,
    isMirrored: Bool
  ) -> CGAffineTransform {
    let frameToCameraMatrix = getFrameToCameraMatrix(
      pixelBuffer: pixelBuffer,
      orientation: orientation,
      isMirrored: isMirrored)
    return frameToCameraMatrix.inverted()
  }
}
