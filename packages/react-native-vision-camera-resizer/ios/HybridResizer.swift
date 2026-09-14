//
//  HybridResizer.swift
//  VisionCamera
//
//  Created by Marc Rousavy on 29.10.25.
//

import AVFoundation
import CoreVideo
import NitroModules
import VisionCamera

/// High-level iOS resizer that turns camera frames into GPU-backed JS-visible output frames.
final class HybridResizer: HybridResizerSpec {
  /// Serializes `resize()` against `dispose()`: `pipeline` is read on the frame-processor thread
  /// while `dispose()` clears it on the JS thread, and a Swift class-reference load/store is not
  /// atomic - `pipeline = nil` racing the `guard let` load is a data race on the possibly-last
  /// reference.
  private let lifecycleLock = NSLock()
  private var pipeline: MetalResizerPipeline?

  init(options: ResizerOptions) throws {
    self.pipeline = try MetalResizerPipeline(options: options)
    super.init()
  }

  var memorySize: Int {
    lifecycleLock.lock()
    defer { lifecycleLock.unlock() }
    return pipeline?.outputByteCount ?? 0
  }

  func dispose() {
    lifecycleLock.lock()
    defer { lifecycleLock.unlock() }
    pipeline = nil
  }

  func resize(frame: any HybridFrameSpec) throws -> any HybridGPUFrameSpec {
    lifecycleLock.lock()
    defer { lifecycleLock.unlock() }
    guard let pipeline else {
      throw RuntimeError.error(withMessage: "This Resizer has already been disposed!")
    }
    let sampleBuffer = try sampleBuffer(from: frame)
    let pixelBuffer = try pixelBuffer(from: sampleBuffer)
    let rotationDegrees = frame.orientation.shaderRotationDegrees
    let isMirrored = frame.isMirrored
    let outputBufferView = try pipeline.run(
      pixelBuffer: pixelBuffer,
      rotationDegrees: rotationDegrees,
      isMirrored: isMirrored)

    return HybridGPUFrame(outputBufferView: outputBufferView)
  }

  private func sampleBuffer(from frame: any HybridFrameSpec) throws -> CMSampleBuffer {
    guard let nativeFrame = frame as? any NativeFrame else {
      throw RuntimeError.error(withMessage: "The given Frame is not of type `NativeFrame`!")
    }
    guard let sampleBuffer = nativeFrame.sampleBuffer else {
      throw RuntimeError.error(withMessage: "The given Frame's `sampleBuffer` is no longer valid!")
    }
    return sampleBuffer
  }

  private func pixelBuffer(from sampleBuffer: CMSampleBuffer) throws -> CVPixelBuffer {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      throw RuntimeError.error(
        withMessage: "The given Frame does not contain a valid image buffer!")
    }
    return pixelBuffer
  }
}
