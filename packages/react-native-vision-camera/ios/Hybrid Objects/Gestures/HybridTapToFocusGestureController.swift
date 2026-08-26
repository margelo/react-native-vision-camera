//
//  HybridTapToFocusGestureController.swift
//  VisionCamera
//
//  Created by Marc Rousavy on 04.02.26.
//

import AVFoundation
import NitroModules
import UIKit

final class HybridTapToFocusGestureController: HybridTapToFocusGestureControllerSpec,
  NativeGestureController
{
  let gestureRecognizer = UITapGestureRecognizer()
  weak var controller: (any HybridCameraControllerSpec)? = nil

  private weak var previewView: (any HybridPreviewViewSpec)? = nil
  private var onTapListeners: [UUID: (any HybridMeteringPointSpec) -> Void] = [:]
  private var onFocusCompletedListeners: [UUID: (any HybridMeteringPointSpec) -> Void] = [:]

  override init() {
    super.init()
    gestureRecognizer.cancelsTouchesInView = false
    gestureRecognizer.addTarget(self, action: #selector(onTap(_:)))
  }

  @objc private func onTap(_ gestureRecognizer: UITapGestureRecognizer) {
    guard let controller, let previewView else {
      return
    }

    do {
      let viewPoint = gestureRecognizer.location(in: gestureRecognizer.view)
      let meteringPoint = try previewView.createMeteringPoint(
        viewX: viewPoint.x,
        viewY: viewPoint.y,
        size: nil)
      let tapListeners = Array(onTapListeners.values)
      tapListeners.forEach { $0(meteringPoint) }

      try controller.focusTo(point: meteringPoint, options: FocusOptions())
        .then { [weak self] _ in
          DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let focusCompletedListeners = Array(self.onFocusCompletedListeners.values)
            focusCompletedListeners.forEach { $0(meteringPoint) }
          }
        }
        .catch { error in
          logger.error("Failed to focus! \(error)")
        }
    } catch {
      logger.error("Failed to focus! \(error)")
    }
  }

  func addOnTapListener(onTap: @escaping (any HybridMeteringPointSpec) -> Void)
    -> ListenerSubscription
  {
    let id = UUID()
    onTapListeners[id] = onTap
    return ListenerSubscription { [weak self] in
      self?.onTapListeners.removeValue(forKey: id)
    }
  }

  func addOnFocusCompletedListener(
    onFocusCompleted: @escaping (any HybridMeteringPointSpec) -> Void
  ) -> ListenerSubscription {
    let id = UUID()
    onFocusCompletedListeners[id] = onFocusCompleted
    return ListenerSubscription { [weak self] in
      self?.onFocusCompletedListeners.removeValue(forKey: id)
    }
  }

  func onAttached(to preview: any HybridPreviewViewSpec) {
    self.previewView = preview
  }
  func onDetached(from preview: any HybridPreviewViewSpec) {
    if self.previewView === preview {
      self.previewView = nil
    }
  }
}
