///
/// FrameInterceptors.swift
/// VisionCamera
///
/// Optional extension point that decorates FrameOutput frame delivery and PreviewView attachment
/// (e.g. to inject test images). Interceptors are only accepted in builds compiled with
/// VISION_CAMERA_FRAME_INTERCEPTORS, set for the configurations listed in the app's package.json
/// under "visionCamera.frameInterceptors.ios" (default: Debug). While nothing is registered,
/// FrameOutput and PreviewView behave as usual.
///

import AVFoundation
import Foundation
import UIKit

public protocol NativeFrameInterceptor: AnyObject {
  /// Called on a FrameOutput's queue for every camera frame. Returns the frame to deliver: the
  /// camera's `sampleBuffer`, a replacement, or nil to drop it.
  func intercept(
    _ sampleBuffer: CMSampleBuffer, orientation: CameraOrientation, isMirrored: Bool
  ) -> CMSampleBuffer?
  /// Called on the main thread after a PreviewView attached its preview layer to `view`.
  func previewViewDidAttach(_ view: UIView)
}

public enum FrameInterceptors {
  /// Whether this build of VisionCamera accepts an interceptor (decided at compile time).
  public static var isEnabled: Bool {
    #if VISION_CAMERA_FRAME_INTERCEPTORS
      return true
    #else
      return false
    #endif
  }

  private static let lock = NSLock()
  private static var registered: (any NativeFrameInterceptor)?

  /// Registers `interceptor`. Only one interceptor can be registered, and only if `isEnabled`;
  /// otherwise the call is refused, logged and returns `false`.
  @discardableResult
  public static func register(_ interceptor: any NativeFrameInterceptor) -> Bool {
    let name = String(describing: type(of: interceptor))
    guard isEnabled else {
      logger.error("Frame interceptors are disabled in this build; ignoring \(name).")
      return false
    }
    lock.lock()
    defer { lock.unlock() }
    if let current = registered {
      logger.error("Frame interceptor \(String(describing: type(of: current))) is already registered; ignoring \(name).")
      return false
    }
    registered = interceptor
    logger.warning("Frame interceptor \(name) registered: camera frames and previews can be replaced in this build.")
    return true
  }

  private static var current: (any NativeFrameInterceptor)? {
    lock.lock()
    defer { lock.unlock() }
    return registered
  }

  static func intercept(
    _ sampleBuffer: CMSampleBuffer, orientation: CameraOrientation, isMirrored: Bool
  ) -> CMSampleBuffer? {
    guard let interceptor = current else { return sampleBuffer }
    return interceptor.intercept(sampleBuffer, orientation: orientation, isMirrored: isMirrored)
  }

  static func previewAttached(_ view: UIView) {
    current?.previewViewDidAttach(view)
  }
}
