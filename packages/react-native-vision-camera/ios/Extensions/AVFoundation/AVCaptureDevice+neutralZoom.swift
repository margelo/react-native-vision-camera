///
/// AVCaptureDevice+neutralZoom.swift
/// VisionCamera
/// Copyright © 2026 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation

extension AVCaptureDevice {
  /**
   * The internal video zoom factor that AVFoundation displays as `1x`.
   *
   * On older iOS versions, derive it from the switchover factor immediately
   * before the standard wide-angle constituent Camera.
   */
  var neutralZoomFactor: Double {
    if #available(iOS 18.0, *) {
      let multiplier = displayVideoZoomFactorMultiplier
      if multiplier > 0 {
        return 1 / multiplier
      }
    }

    guard
      let wideAngleIndex = constituentDevices.firstIndex(where: {
        $0.deviceType == .builtInWideAngleCamera
      }),
      wideAngleIndex > 0
    else {
      return 1
    }

    let switchoverIndex = wideAngleIndex - 1
    guard virtualDeviceSwitchOverVideoZoomFactors.indices.contains(switchoverIndex) else {
      return 1
    }
    return virtualDeviceSwitchOverVideoZoomFactors[switchoverIndex].doubleValue
  }
}
