///
/// AVCaptureConnection+orientation.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules
import ObjectiveC
import UIKit

extension AVCaptureConnection {
  var orientation: CameraOrientation {
    return CameraOrientation(avOrientation: videoOrientation)
  }

  func setOrientation(_ orientation: CameraOrientation) throws {
    guard self.isVideoOrientationSupported else {
      throw RuntimeError.error(
        withMessage:
          "Cannot set orientation=\"\(orientation.stringValue)\" - this connection does not support orientation changing"
      )
    }
    self.videoOrientation = orientation.toAVCaptureVideoOrientation()

    if #available(iOS 17.0, *) {
      if Thread.isMainThread {
        self.followDisplayRotation(for: orientation)
      } else {
        DispatchQueue.main.async {
          self.followDisplayRotation(for: orientation)
        }
      }
    }
  }

  /// Follows `AVCaptureDevice.RotationCoordinator` if the display is not aligned with the camera
  /// (e.g. the iPhone Duo's inner display), where the interface orientation alone is 90° off.
  @available(iOS 17.0, *)
  private func followDisplayRotation(for orientation: CameraOrientation) {
    objc_setAssociatedObject(self, &displayRotationFollowerKey, nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    guard orientation == CameraOrientation(interfaceOrientation: UIApplication.shared.interfaceOrientation),
      let device = self.deviceInput?.device,
      let layer = UIApplication.shared.interfaceWindowLayer
    else { return }

    // A RotationCoordinator reports 0° for a layer that is not in a window yet, which the Preview layer
    // might not be at this point - so we use the window's layer instead.
    let coordinator = AVCaptureDevice.RotationCoordinator(device: device, previewLayer: layer)
    let observation = coordinator.observe(\.videoRotationAngleForHorizonLevelPreview, options: [.initial, .new]) { [weak self] coordinator, _ in
      guard let self else { return }
      let angle = coordinator.videoRotationAngleForHorizonLevelPreview
      guard self.isVideoRotationAngleSupported(angle), self.videoRotationAngle != angle else { return }
      logger.info("Display is not aligned with the Camera - rotating by \(Int(angle))° instead of \(Int(self.videoRotationAngle))°.")
      self.videoRotationAngle = angle
    }
    let follower = DisplayRotationFollower(coordinator: coordinator, observation: observation)
    objc_setAssociatedObject(self, &displayRotationFollowerKey, follower, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
  }
}

private var displayRotationFollowerKey: UInt8 = 0

/// Keeps the `AVCaptureDevice.RotationCoordinator` and its observation alive for as long as the connection lives.
@available(iOS 17.0, *)
private final class DisplayRotationFollower {
  let coordinator: AVCaptureDevice.RotationCoordinator
  let observation: NSKeyValueObservation

  init(coordinator: AVCaptureDevice.RotationCoordinator, observation: NSKeyValueObservation) {
    self.coordinator = coordinator
    self.observation = observation
  }
}
