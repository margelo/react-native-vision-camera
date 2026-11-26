///
/// HybridInterfaceOrientationManager.swift
/// VisionCamera
/// Copyright © 2026 Marc Rousavy @ Margelo
///

import Foundation
import NitroModules
import UIKit

final class HybridInterfaceOrientationManager: HybridOrientationManagerSpec {
  let source: OrientationSource = .interface
  private(set) var currentOrientation: CameraOrientation? = nil
  private var observer: NSObjectProtocol? = nil
  /// The interface can rotate without the device moving, for example when a
  /// screen locked to another orientation is presented while rotation lock is
  /// on. That posts no `UIDevice.orientationDidChangeNotification`, but every
  /// interface rotation changes the window scene's `effectiveGeometry`.
  private var sceneGeometryObservations: [NSKeyValueObservation] = []

  override init() {
    super.init()
    DispatchQueue.main.async {
      let interfaceOrientation = UIApplication.shared.interfaceOrientation
      self.currentOrientation = CameraOrientation(interfaceOrientation: interfaceOrientation)
    }
  }

  deinit {
    // The observations were created on the main thread; deinit can run on any thread.
    let observations = sceneGeometryObservations
    DispatchQueue.main.async {
      observations.forEach { $0.invalidate() }
    }
  }

  func startOrientationUpdates(onChanged: @escaping (CameraOrientation) -> Void) {
    DispatchQueue.main.async {
      logger.info("Starting interface orientation updates...")

      if let observer = self.observer {
        // Remove old listeners
        NotificationCenter.default.removeObserver(observer)
        UIDevice.current.endGeneratingDeviceOrientationNotifications()
      }
      self.stopObservingSceneGeometry()

      // Start new listener (beginGeneratingDeviceOrientationNotifications() can be nested)
      UIDevice.current.beginGeneratingDeviceOrientationNotifications()

      let interfaceOrientation = UIApplication.shared.interfaceOrientation
      if interfaceOrientation != .unknown {
        let orientation = CameraOrientation(interfaceOrientation: interfaceOrientation)
        self.currentOrientation = orientation
        onChanged(orientation)
      }

      self.observer = NotificationCenter.default.addObserver(
        forName: UIDevice.orientationDidChangeNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        guard let self else { return }
        let interfaceOrientation = UIApplication.shared.interfaceOrientation
        guard interfaceOrientation != .unknown else {
          logger.warning("UIInterfaceOrientation is .unknown!")
          return
        }
        let orientation = CameraOrientation(interfaceOrientation: interfaceOrientation)
        if self.currentOrientation != orientation {
          logger.info("Interface orientation changed: \(orientation.stringValue)")
          self.currentOrientation = orientation
          onChanged(orientation)
        }
      }

      // Also follow interface rotations that happen without the device moving
      self.observeSceneGeometry(onChanged: onChanged)
    }
  }

  func stopOrientationUpdates() {
    DispatchQueue.main.async {
      self.stopObservingSceneGeometry()
      if let observer = self.observer {
        logger.info("Stopping interface orientation updates...")
        NotificationCenter.default.removeObserver(observer)
        self.observer = nil
        UIDevice.current.endGeneratingDeviceOrientationNotifications()
      }
    }
  }

  /// Main thread only.
  private func observeSceneGeometry(onChanged: @escaping (CameraOrientation) -> Void) {
    guard #available(iOS 16.0, *) else { return }
    // Every connected scene, not only the foreground-active one that
    // `UIApplication.interfaceOrientation` reads: this can start while
    // the scene is still activating.
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    sceneGeometryObservations = scenes.map { scene in
      scene.observe(\.effectiveGeometry, options: [.new]) { [weak self] scene, _ in
        let update = {
          guard let self else { return }
          let interfaceOrientation = scene.effectiveGeometry.interfaceOrientation
          guard interfaceOrientation != .unknown else { return }
          let orientation = CameraOrientation(interfaceOrientation: interfaceOrientation)
          guard self.currentOrientation != orientation else { return }
          logger.info(
            "Interface orientation changed without device rotation: \(orientation.stringValue)")
          self.currentOrientation = orientation
          onChanged(orientation)
        }
        // UIKit changes the geometry on the main thread; only hop if that ever changes.
        if Thread.isMainThread { update() } else { DispatchQueue.main.async(execute: update) }
      }
    }
  }

  /// Main thread only.
  private func stopObservingSceneGeometry() {
    sceneGeometryObservations.forEach { $0.invalidate() }
    sceneGeometryObservations = []
  }
}
