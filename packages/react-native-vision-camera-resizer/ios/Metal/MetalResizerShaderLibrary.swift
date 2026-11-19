//
//  MetalResizerShaderLibrary.swift
//  VisionCamera
//
//  Created by Marc Rousavy on 11.03.26.
//

import Foundation
import Metal
import NitroModules

/// The per-dispatch parameters shared with the Metal kernel.
struct MetalResizerUniforms {
  var outputWidth: UInt32
  var outputHeight: UInt32
  var rotationDegrees: Int32
  var isMirrored: UInt32
}

/// Loads the precompiled Metal shader bundle and resolves the compute pipeline used by the resizer.
enum MetalResizerShaderLibrary {
  private static let shaderBundleName = "VisionCameraResizerShaders"
  private enum FunctionConstantIndex: Int {
    case channelOrder = 0
    case pixelLayout = 1
    case channelCount = 2
    case scaleMode = 3
    case downscaleFilter = 4
  }

  /**
   * Creates a compute pipeline state for one fixed output configuration.
   */
  static func createPipelineState(
    device: MTLDevice,
    options: ResizerOptions
  ) throws -> MTLComputePipelineState {
    let functionName = functionName(for: options.dataType)
    let functionConstantValues = makeFunctionConstantValues(options: options)
    do {
      let library = try loadPrecompiledLibrary(device: device)
      let function = try makeFunction(
        named: functionName, constants: functionConstantValues, in: library)
      return try device.makeComputePipelineState(function: function)
    } catch let runtimeError as RuntimeError {
      throw runtimeError
    } catch {
      throw RuntimeError.error(
        withMessage:
          "Failed to create Metal resize pipeline (\(functionName)): \(error.localizedDescription)")
    }
  }

  /**
   * Chooses a threadgroup size that matches the device's compute limits.
   */
  static func optimalThreadgroupSize(for pipelineState: MTLComputePipelineState) -> MTLSize {
    let width = min(pipelineState.threadExecutionWidth, 16)
    let height = max(1, min(16, pipelineState.maxTotalThreadsPerThreadgroup / max(width, 1)))
    return MTLSize(width: width, height: height, depth: 1)
  }

  /**
   * Looks up one compute function by name from the precompiled shader bundle.
   */
  private static func makeFunction(
    named functionName: String,
    constants: MTLFunctionConstantValues,
    in library: MTLLibrary
  ) throws
    -> MTLFunction
  {
    do {
      return try library.makeFunction(name: functionName, constantValues: constants)
    } catch {
      throw RuntimeError.error(
        withMessage:
          "Failed to specialize Metal function `\(functionName)` from the precompiled library. "
          + "Ensure `ResizerKernels.metal` is included in the `\(shaderBundleName)` resource bundle "
          + "and that all required function constants are provided: \(error.localizedDescription)")
    }
  }

  /**
   * Bakes the fixed output layout into the Metal function so only per-frame transform inputs stay dynamic.
   */
  private static func makeFunctionConstantValues(options: ResizerOptions)
    -> MTLFunctionConstantValues
  {
    let functionConstantValues = MTLFunctionConstantValues()
    var channelOrder = options.channelOrder.shaderOrdinal
    var pixelLayout = options.pixelLayout.shaderOrdinal
    var channelCount = UInt32(options.channelOrder.channelsPerPixel)
    var scaleMode = options.scaleMode.shaderOrdinal
    var downscaleFilter = options.downscaleFilter.shaderOrdinal

    functionConstantValues.setConstantValue(
      &channelOrder, type: .uint, index: FunctionConstantIndex.channelOrder.rawValue)
    functionConstantValues.setConstantValue(
      &pixelLayout, type: .uint, index: FunctionConstantIndex.pixelLayout.rawValue)
    functionConstantValues.setConstantValue(
      &channelCount, type: .uint, index: FunctionConstantIndex.channelCount.rawValue)
    functionConstantValues.setConstantValue(
      &scaleMode, type: .uint, index: FunctionConstantIndex.scaleMode.rawValue)
    functionConstantValues.setConstantValue(
      &downscaleFilter, type: .uint, index: FunctionConstantIndex.downscaleFilter.rawValue)

    return functionConstantValues
  }

  /**
   * Resolves the precompiled Metal function name for one output data type.
   */
  private static func functionName(for dataType: DataType) -> String {
    switch dataType {
    case .int8:
      return "resize_int8"
    case .uint8:
      return "resize_uint8"
    case .float16:
      return "resize_float16"
    case .float32:
      return "resize_float32"
    }
  }

  private static func loadPrecompiledLibrary(device: MTLDevice) throws -> MTLLibrary {
    let bundle = try shaderBundle()
    do {
      return try device.makeDefaultLibrary(bundle: bundle)
    } catch {
      throw RuntimeError.error(
        withMessage:
          "Failed to load precompiled Metal library from `\(Self.shaderBundleName).bundle`: "
          + "\(error.localizedDescription). Ensure `ResizerKernels.metal` is compiled into the resource bundle "
          + "and rebuild."
      )
    }
  }

  private static func shaderBundle() throws -> Bundle {
    guard
      let bundleURL = Bundle.main.url(forResource: Self.shaderBundleName, withExtension: "bundle"),
      let bundle = Bundle(url: bundleURL)
    else {
      throw RuntimeError.error(
        withMessage:
          "Failed to find `\(Self.shaderBundleName).bundle` containing the precompiled Metal library. "
          + "Ensure CocoaPods resources are installed and rebuild.")
    }
    return bundle
  }
}
