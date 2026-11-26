///
/// UI+CameraOrientation.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules

extension CameraOrientation {
  /**
   * Creates the `CameraOrientation` of an image displayed with the
   * given `UIImage.Orientation`, its mirroring being `uiOrientation.isMirrored`.
   * See ``appleName(isMirrored:)``.
   */
  init(uiOrientation: UIImage.Orientation) {
    let name: CameraOrientation
    switch uiOrientation {
    case .up, .upMirrored:
      name = .up
    case .down, .downMirrored:
      name = .down
    case .left, .leftMirrored:
      name = .left
    case .right, .rightMirrored:
      name = .right
    @unknown default:
      fatalError("UIImage.Orientation has unknown value: \(uiOrientation)")
    }
    self = name.appleName(isMirrored: uiOrientation.isMirrored)
  }
  init(interfaceOrientation: UIInterfaceOrientation) {
    switch interfaceOrientation {
    case .portrait:
      self = .up
    case .portraitUpsideDown:
      self = .down
    case .landscapeLeft:
      self = .right
    case .landscapeRight:
      self = .left
    case .unknown:
      self = .up
    @unknown default:
      fatalError("UIInterfaceOrientation has unknown value: \(interfaceOrientation)")
    }
  }

  /**
   * Converts this `CameraOrientation` to the `UIImage.Orientation`
   * that displays the image this orientation (and `isMirrored`) describes.
   * See ``appleName(isMirrored:)``.
   */
  func toUIImageOrientation(isMirrored: Bool) -> UIImage.Orientation {
    switch self.appleName(isMirrored: isMirrored) {
    case .up:
      return isMirrored ? .upMirrored : .up
    case .down:
      return isMirrored ? .downMirrored : .down
    case .left:
      return isMirrored ? .leftMirrored : .left
    case .right:
      return isMirrored ? .rightMirrored : .right
    }
  }

  /**
   * This orientation with its quarter turns inverted
   * (`.left` and `.right` swap, `.up` and `.down` stay).
   */
  var inverted: CameraOrientation {
    switch self {
    case .up, .down:
      return self
    case .left:
      return .right
    case .right:
      return .left
    }
  }

  /**
   * The name Apple's orientations (`UIImage.Orientation`,
   * `CGImagePropertyOrientation`/EXIF) give to this orientation.
   *
   * A `CameraOrientation` says where the content's top is (`.left`: on the
   * left, so it is displayed by rotating it 90° clockwise), and it rotates
   * before mirroring. Apple's orientations name the rotation that displays
   * the content (`.right`, EXIF 6: rotate 90° clockwise), and they mirror
   * before rotating, which inverts the rotation again. So un-mirrored quarter
   * turns swap names while mirrored ones keep them: a portrait back camera
   * buffer (`.left`) is `UIImage.Orientation.right` (EXIF 6), and a mirrored
   * one is `.leftMirrored` (EXIF 5). The conversion is its own inverse.
   */
  func appleName(isMirrored: Bool) -> CameraOrientation {
    return isMirrored ? self : self.inverted
  }
}
