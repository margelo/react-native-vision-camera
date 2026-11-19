//
//  MetalResizerPipeline.swift
//  VisionCamera
//
//  Created by Marc Rousavy on 11.03.26.
//

import CoreVideo
import Metal
import NitroModules

/// Owns the Metal runtime objects needed to run the resize kernel for one fixed output layout.
final class MetalResizerPipeline {
  private let options: ResizerOptions
  private let commandQueue: MTLCommandQueue
  private let textureCache: CVMetalTextureCache
  private let pipelineState: MTLComputePipelineState
  private let threadsPerThreadgroup: MTLSize
  private let outputBuffer: MetalReusableBuffer

  /**
   * Builds the Metal pipeline for one fixed output size and output layout.
   */
  init(options: ResizerOptions) throws {
    guard let device = MTLCreateSystemDefaultDevice() else {
      throw RuntimeError.error(
        withMessage: "Failed to initialize Metal - no MTLDevice is available.")
    }
    guard let commandQueue = device.makeCommandQueue() else {
      throw RuntimeError.error(withMessage: "Failed to initialize Metal command queue.")
    }

    let outputWidth = Int(options.width)
    let outputHeight = Int(options.height)
    // `pixelLayout` only changes how channel values are arranged in memory, not how many are stored.
    let outputBufferLength = options.channelOrder.getOutputTotalByteCount(
      dataType: options.dataType,
      width: outputWidth,
      height: outputHeight)
    let pipelineState = try MetalResizerShaderLibrary.createPipelineState(
      device: device, options: options)
    let threadsPerThreadgroup = MetalResizerShaderLibrary.optimalThreadgroupSize(for: pipelineState)

    var textureCache: CVMetalTextureCache?
    let cacheStatus = CVMetalTextureCacheCreate(
      kCFAllocatorDefault, nil, device, nil, &textureCache)
    guard cacheStatus == kCVReturnSuccess, let textureCache else {
      throw RuntimeError.error(
        withMessage: "Failed to create CVMetalTextureCache (status \(cacheStatus)).")
    }

    let outputBuffer = try MetalReusableBuffer(device: device, bufferLength: outputBufferLength)

    self.options = options
    self.commandQueue = commandQueue
    self.textureCache = textureCache
    self.pipelineState = pipelineState
    self.threadsPerThreadgroup = threadsPerThreadgroup
    self.outputBuffer = outputBuffer
  }

  /**
   * The fixed output width for this pipeline instance.
   */
  private var outputWidth: Int {
    return Int(options.width)
  }

  /**
   * The fixed output height for this pipeline instance.
   */
  private var outputHeight: Int {
    return Int(options.height)
  }

  /**
   * The exact packed output size for one resized frame.
   */
  var outputByteCount: Int {
    // `pixelLayout` only changes how channel values are arranged in memory, not the total byte count.
    return options.channelOrder.getOutputTotalByteCount(
      dataType: options.dataType,
      width: outputWidth,
      height: outputHeight)
  }

  deinit {
    CVMetalTextureCacheFlush(textureCache, 0)
  }

  /**
   * Runs the resize shader for one camera frame and returns a live view over the reusable output buffer.
   */
  func run(
    pixelBuffer: CVPixelBuffer,
    rotationDegrees: Int32,
    isMirrored: Bool
  ) throws -> MetalBufferView {
    let outputBufferView = try outputBuffer.acquireView(
      width: outputWidth,
      height: outputHeight,
      channelOrder: options.channelOrder,
      dataType: options.dataType,
      pixelLayout: options.pixelLayout)
    let uniforms = makeUniforms(
      rotationDegrees: rotationDegrees,
      isMirrored: isMirrored,
      colorMatrix: Self.colorMatrixOrdinal(of: pixelBuffer))
    let inputTextures = try MetalResizerInputTextures.make(
      from: pixelBuffer,
      textureCache: textureCache)
    try encodeAndRun(
      inputTextures: inputTextures,
      outputBuffer: outputBufferView.buffer,
      uniforms: uniforms)
    return outputBufferView
  }

  /**
   * Builds the shader uniforms for one dispatch.
   */
  private func makeUniforms(rotationDegrees: Int32, isMirrored: Bool, colorMatrix: UInt32)
    -> MetalResizerUniforms
  {
    return MetalResizerUniforms(
      outputWidth: UInt32(outputWidth),
      outputHeight: UInt32(outputHeight),
      rotationDegrees: rotationDegrees,
      isMirrored: isMirrored ? 1 : 0,
      colorMatrix: colorMatrix)
  }

  /**
   * The YCbCr matrix the camera tagged this buffer with, so the shader converts it
   * the same way AVFoundation's own BGRA conversion would. HD capture is BT.709.
   * Untagged buffers keep BT.601.
   */
  private static func colorMatrixOrdinal(of pixelBuffer: CVPixelBuffer) -> UInt32 {
    guard
      let attachment = CVBufferCopyAttachment(pixelBuffer, kCVImageBufferYCbCrMatrixKey, nil),
      CFGetTypeID(attachment) == CFStringGetTypeID()
    else {
      return 0
    }
    let matrix = attachment as! CFString
    if CFEqual(matrix, kCVImageBufferYCbCrMatrix_ITU_R_709_2) {
      return 1
    }
    if CFEqual(matrix, kCVImageBufferYCbCrMatrix_ITU_R_2020) {
      return 2
    }
    return 0
  }

  /**
   * The threadgroup grid that covers the full output image, rounded up.
   * The kernels bounds-check `gid`, so this also works on GPUs that do not
   * support non-uniform threadgroups.
   */
  private func threadgroupsPerGrid(threadsPerThreadgroup: MTLSize) -> MTLSize {
    return MTLSize(
      width: (outputWidth + threadsPerThreadgroup.width - 1) / threadsPerThreadgroup.width,
      height: (outputHeight + threadsPerThreadgroup.height - 1) / threadsPerThreadgroup.height,
      depth: 1)
  }

  private func encodeAndRun(
    inputTextures: MetalResizerInputTextures,
    outputBuffer: MTLBuffer,
    uniforms: MetalResizerUniforms
  ) throws {
    guard let commandBuffer = commandQueue.makeCommandBuffer() else {
      throw RuntimeError.error(withMessage: "Failed to create Metal command buffer.")
    }
    guard let encoder = commandBuffer.makeComputeCommandEncoder() else {
      throw RuntimeError.error(withMessage: "Failed to create Metal compute command encoder.")
    }
    var uniforms = uniforms

    encoder.setComputePipelineState(pipelineState)
    encoder.setTexture(inputTextures.yPlane.texture, index: 0)
    encoder.setTexture(inputTextures.uvPlane.texture, index: 1)
    encoder.setBuffer(outputBuffer, offset: 0, index: 0)
    encoder.setBytes(&uniforms, length: MemoryLayout<MetalResizerUniforms>.stride, index: 1)
    encoder.dispatchThreadgroups(
      threadgroupsPerGrid(threadsPerThreadgroup: threadsPerThreadgroup),
      threadsPerThreadgroup: threadsPerThreadgroup)
    encoder.endEncoding()

    commandBuffer.commit()
    commandBuffer.waitUntilCompleted()

    // Keep the CoreVideo-backed textures alive until GPU execution has finished.
    withExtendedLifetime(inputTextures) {}

    guard commandBuffer.status == .completed else {
      let message =
        commandBuffer.error?.localizedDescription ?? "Unknown Metal command buffer error."
      throw RuntimeError.error(
        withMessage:
          "Metal resize pipeline failed (status \(commandBuffer.status.rawValue)): \(message)")
    }
  }
}
