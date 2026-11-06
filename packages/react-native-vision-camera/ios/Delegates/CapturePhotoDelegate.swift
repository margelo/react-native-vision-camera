//
//  CapturePhotoDelegate.swift
//  VisionCamera
//
//  Created by Marc Rousavy on 29.10.25.
//

import AudioToolbox
import AVFoundation
import Foundation

final class CapturePhotoDelegate: NSObject, AVCapturePhotoCaptureDelegate {
  // Statically cache delegates because the AVCaptureOutput only captures them weakly
  private static var delegates: [CapturePhotoDelegate] = []

  private let onCaptured: (AVCapturePhoto, MediaSampleMetadata) -> Void
  private let onError: (any Error) -> Void
  private let callbacks: CapturePhotoCallbacks
  private let shouldDisposeShutterSound: Bool
  private var didResolve = false

  init(
    shouldDisposeShutterSound: Bool,
    onCaptured: @escaping (AVCapturePhoto, MediaSampleMetadata) -> Void,
    onError: @escaping (any Error) -> Void,
    callbacks: CapturePhotoCallbacks
  ) {
    self.onCaptured = onCaptured
    self.onError = onError
    self.callbacks = callbacks
    self.shouldDisposeShutterSound = shouldDisposeShutterSound
    super.init()
    // Add a static strong reference while capture is in progress
    CapturePhotoDelegate.delegates.append(self)
  }

  // 1. Begin capture process
  func photoOutput(
    _ output: AVCapturePhotoOutput,
    willBeginCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings
  ) {
    callbacks.onWillBeginCapture?()
  }

  // 2. About to capture photo
  func photoOutput(
    _ output: AVCapturePhotoOutput,
    willCapturePhotoFor resolvedSettings: AVCaptureResolvedPhotoSettings
  ) {
    if shouldDisposeShutterSound {
      // disable system shutter sound (see https://stackoverflow.com/a/55235949/5281431)
      AudioServicesDisposeSystemSoundID(1108)
    }
    callbacks.onWillCapturePhoto?()
  }

  // 3. Captured actual photo (or error)
  func photoOutput(
    _ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto,
    error: (any Error)?
  ) {
    do {
      if let error {
        // an error occurred - throw it
        throw error
      }
      let metadata = try photo.getMediaSampleMetadata()
      // resolve callback with photo
      onCaptured(photo, metadata)
    } catch {
      // resolve callback with error
      onError(error)
    }
    didResolve = true
  }

  // 4. Photo capture done
  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didCapturePhotoFor resolvedSettings: AVCaptureResolvedPhotoSettings
  ) {
    callbacks.onDidCapturePhoto?()
  }

  // 5. Capture process done
  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings, error: (any Error)?
  ) {
    if let error {
      if !didResolve {
        onError(error)
      }
    }
    // Remove the static strong reference, we're done
    CapturePhotoDelegate.delegates.removeAll { $0 == self }
  }

  @available(iOS 17.0, *)
  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishCapturingDeferredPhotoProxy deferredPhotoProxy: AVCaptureDeferredPhotoProxy?,
    error: (any Error)?
  ) {
    logger.warning("didFinishCapturingDeferredPhotoProxy is not implemented!")
  }
}
