///
/// HybridCameraPhotoOutput.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules
import UIKit

final class HybridZoomGestureController: HybridZoomGestureControllerSpec, NativeGestureController {
  let gestureRecognizer = UIPinchGestureRecognizer()
  weak var controller: (any HybridCameraControllerSpec)? = nil

  private let MAX_ZOOM_FACTOR = 15.0
  private var initialZoomFactor = 1.0
  private var onZoomChangedListeners: [UUID: (Double) -> Void] = [:]

  override init() {
    super.init()
    gestureRecognizer.cancelsTouchesInView = false
    gestureRecognizer.addTarget(self, action: #selector(onPinch(_:)))
  }

  @objc private func onPinch(_ gestureRecognizer: UIPinchGestureRecognizer) {
    guard let controller = controller as? any NativeCameraController else {
      return
    }
    let device = controller.captureDevice

    switch gestureRecognizer.state {
    case .began:
      initialZoomFactor = device.videoZoomFactor
    case .changed:
      let targetFactor = initialZoomFactor * gestureRecognizer.scale
      let minZoom = device.minAvailableVideoZoomFactor
      let maxZoom = min(device.maxAvailableVideoZoomFactor, MAX_ZOOM_FACTOR)
      let zoom = min(max(targetFactor, minZoom), maxZoom)
      let listeners = Array(onZoomChangedListeners.values)

      listeners.forEach { $0(zoom) }

      controller.queue.async {
        do {
          try device.lockForConfiguration()
          device.videoZoomFactor = zoom
          device.unlockForConfiguration()
        } catch {
          logger.error("Failed to lock device for zooming! \(error)")
        }
      }
    default:
      break
    }
  }

  func addOnZoomChangedListener(onZoomChanged: @escaping (Double) -> Void)
    -> ListenerSubscription
  {
    let id = UUID()
    onZoomChangedListeners[id] = onZoomChanged
    return ListenerSubscription { [weak self] in
      self?.onZoomChangedListeners.removeValue(forKey: id)
    }
  }
}
