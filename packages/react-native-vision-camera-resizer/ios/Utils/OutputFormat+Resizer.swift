//
//  OutputFormat+Resizer.swift
//  VisionCamera
//
//  Created by Marc Rousavy on 11.03.26.
//

/// Output layout helpers used by the iOS resizer.
extension ChannelOrder {
  /// Returns the integer ordinal expected by the GPU shaders for this channel order.
  var shaderOrdinal: UInt32 {
    switch self {
    case .rgb:
      return 0
    case .bgr:
      return 1
    }
  }

  /// Returns the number of packed output channels written for each pixel in this output layout.
  var channelsPerPixel: Int {
    switch self {
    case .rgb, .bgr:
      return 3
    }
  }

  /// Returns the exact byte count for one tightly packed output image.
  func getOutputTotalByteCount(dataType: DataType, width: Int, height: Int) -> Int {
    return width * height * channelsPerPixel * dataType.bytesPerChannel
  }
}

extension PixelLayout {
  /// Returns the integer ordinal expected by the GPU shaders for this pixel layout.
  var shaderOrdinal: UInt32 {
    switch self {
    case .interleaved:
      return 0
    case .planar:
      return 1
    }
  }
}

extension DataType {
  /// Returns the number of bytes used by one output channel for this data type.
  var bytesPerChannel: Int {
    switch self {
    case .int8, .uint8:
      return 1
    case .float16:
      return 2
    case .float32:
      return 4
    }
  }
}

extension Optional where Wrapped == DownscaleFilter {
  /// Returns the integer ordinal expected by the GPU shaders for this downscale filter.
  /// `nil` is the default, `.bilinear`.
  var shaderOrdinal: UInt32 {
    switch self {
    case .none, .bilinear:
      return 0
    case .area:
      return 1
    }
  }
}

extension ScaleMode {
  /// Returns the integer ordinal expected by the GPU shaders for this scale mode.
  var shaderOrdinal: UInt32 {
    switch self {
    case .cover:
      return 0
    case .contain:
      return 1
    case .stretch:
      return 2
    }
  }
}
