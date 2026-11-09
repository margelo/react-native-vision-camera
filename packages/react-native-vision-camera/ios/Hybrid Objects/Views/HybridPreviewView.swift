///
/// HybridPreviewView.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroImage
import NitroModules

final class HybridPreviewView: HybridPreviewViewSpec {
  var view: UIView = AutoLayerResizingView()
  var previewOutput: (any HybridCameraPreviewOutputSpec)? {
    didSet {
      updatePreviewLayer()
    }
  }

  var onPreviewStarted: (() -> Void)? = nil
  var onPreviewStopped: (() -> Void)? = nil
  private var isPreviewingObserver: NSKeyValueObservation? = nil

  // This field does nothing on iOS.
  var implementationMode: PreviewImplementationMode? = nil

  var resizeMode: PreviewResizeMode? = .cover {
    didSet {
      let newResizeMode = resizeMode ?? .cover
      if newResizeMode != oldValue,
        let previewLayer
      {
        DispatchQueue.main.async {
          previewLayer.videoGravity = newResizeMode.toAVLayerVideoGravity()
        }
      }
    }
  }

  var gestureControllers: [any HybridGestureControllerSpec]? {
    didSet {
      let newValue = gestureControllers
      DispatchQueue.main.async {
        for oldController in oldValue ?? [] {
          if let oldController = oldController as? any NativeGestureController {
            self.view.removeGestureRecognizer(oldController.gestureRecognizer)
            oldController.onDetached(from: self)
          }
        }
        for newController in newValue ?? [] {
          if let newController = newController as? any NativeGestureController {
            self.view.addGestureRecognizer(newController.gestureRecognizer)
            newController.onAttached(to: self)
          }
        }
      }
    }
  }

  private var previewLayer: AVCaptureVideoPreviewLayer? {
    guard let previewOutput = previewOutput as? any NativePreviewViewOutput else {
      return nil
    }
    return previewOutput.previewLayer
  }

  func convertCameraPointToViewPoint(cameraPoint: Point) throws -> Point {
    guard let previewLayer else {
      throw RuntimeError.error(
        withMessage: "Cannot convert camera point to view point - PreviewView isn't ready yet!")
    }
    let converted = previewLayer.layerPointConverted(
      fromCaptureDevicePoint: cameraPoint.toCGPoint())
    return Point(converted)
  }

  func convertViewPointToCameraPoint(viewPoint: Point) throws -> Point {
    guard let previewLayer else {
      throw RuntimeError.error(
        withMessage: "Cannot convert camera point to view point - PreviewView isn't ready yet!")
    }
    let converted = previewLayer.captureDevicePointConverted(fromLayerPoint: viewPoint.toCGPoint())
    return Point(converted)
  }

  func convertScannedObjectCoordinatesToViewCoordinates(
    scannedObject: (any HybridScannedObjectSpec)
  ) throws -> (any HybridScannedObjectSpec) {
    guard let previewLayer else {
      throw RuntimeError.error(
        withMessage:
          "Cannot convert Scanned Object to view coordinates - PreviewView isn't ready yet!")
    }
    guard let object = scannedObject as? any NativeScannedObject else {
      throw RuntimeError.error(
        withMessage: "The given `scannedObject` is not of type `NativeScannedObject`!")
    }
    guard let transformedObject = previewLayer.transformedMetadataObject(for: object.object) else {
      throw RuntimeError.error(
        withMessage: "Failed to transform the Scanned Object's coordinates into view coordinates!")
    }
    return HybridCameraObjectOutput.createHybridScannedObject(from: transformedObject)
  }

  func createMeteringPoint(viewX: Double, viewY: Double, size: Double?) throws
    -> any HybridMeteringPointSpec
  {
    guard let previewLayer else {
      throw RuntimeError.error(
        withMessage: "Cannot create MeteringPoint - PreviewView is not ready yet!")
    }
    let relativePoint = CGPoint(x: viewX, y: viewY)
    let normalizedPoint = previewLayer.captureDevicePointConverted(fromLayerPoint: relativePoint)
    return HybridMeteringPoint(
      relativeX: relativePoint.x,
      relativeY: relativePoint.y,
      relativeSize: size,
      normalizedX: normalizedPoint.x,
      normalizedY: normalizedPoint.y)
  }

  func takeSnapshot() throws -> Promise<any HybridImageSpec> {
    throw RuntimeError.error(withMessage: "takeSnapshot() is not available on iOS!")
  }

  private func updatePreviewLayer() {
    DispatchQueue.main.async {
      if let previewLayer = self.previewLayer {
        // Remove all sublayers that are not our AVCaptureVideoPreviewLayer
        self.view.layer.sublayers?.removeAll { $0 != previewLayer }
        if self.view.layer.sublayers?.contains(previewLayer) != true {
          // If we don't have the preview layer, we add it here
          self.view.layer.addSublayer(previewLayer)
        }
        previewLayer.frame = self.view.bounds
        FrameInterceptors.previewAttached(self.view)

        // Update resizeMode
        let resizeMode = self.resizeMode ?? .cover
        previewLayer.videoGravity = resizeMode.toAVLayerVideoGravity()

        // Add listener to `isPreviewing`
        self.isPreviewingObserver = previewLayer.observe(
          \.isPreviewing,
          options: [.initial, .new, .old],
          changeHandler: { [weak self] _, change in
            guard let self else { return }
            guard let wasPreviewing = change.oldValue,
              let isPreviewing = change.newValue
            else { return }
            guard wasPreviewing != isPreviewing else { return }
            if isPreviewing {
              logger.info("PreviewView started!")
              self.onPreviewStarted?()
            } else {
              logger.info("PreviewView stopped!")
              self.onPreviewStopped?()
            }
          })
      } else {
        // Remove all sublayers (including the AVCaptureVideoPreviewLayer)
        self.view.layer.sublayers?.removeAll()
        // Remove listener to `isPreviewing`
        self.onPreviewStopped?()
        self.isPreviewingObserver = nil
      }
    }
  }
}
