#include <metal_stdlib>
using namespace metal;

struct ResizeUniforms {
  uint outputWidth;
  uint outputHeight;
  int rotationDegrees;
  uint isMirrored;
};

constexpr sampler resizeSampler(coord::normalized, address::clamp_to_edge, filter::linear);

// 0u == ChannelOrder::RGB, 1u == ChannelOrder::BGR
constant uint kChannelOrder [[function_constant(0)]];
// 0u == PixelLayout::INTERLEAVED == HWC / NHWC, 1u == PixelLayout::PLANAR == CHW / NCHW
constant uint kPixelLayout [[function_constant(1)]];
// Number of channels per pixel. e.g. for RGB/BGR, this is 3u.
constant uint kChannelCount [[function_constant(2)]];
// 0u == ScaleMode::COVER, 1u == ScaleMode::CONTAIN, 2u == ScaleMode::STRETCH
constant uint kScaleMode [[function_constant(3)]];
// 0u == DownscaleFilter::BILINEAR, 1u == DownscaleFilter::AREA
constant uint kDownscaleFilter [[function_constant(4)]];

inline float3 yuvToRgb(float y, float2 uv) {
  float cb = uv.x - 0.5f;
  float cr = uv.y - 0.5f;

  float r = y + 1.402f * cr;
  float g = y - 0.344136f * cb - 0.714136f * cr;
  float b = y + 1.772f * cb;

  return clamp(float3(r, g, b), 0.0f, 1.0f);
}

/// Samples the source at one point of the output, `outputCoordinate` being in normalized output space.
inline float3 sampleRgbAt(
  texture2d<float, access::sample> yTexture,
  texture2d<float, access::sample> uvTexture,
  float2 outputCoordinate,
  constant ResizeUniforms& uniforms
) {
  float2 outputSize = float2(uniforms.outputWidth, uniforms.outputHeight);
  float2 sourceSize = float2(yTexture.get_width(), yTexture.get_height());

  int normalizedRotation = uniforms.rotationDegrees % 360;
  if (normalizedRotation < 0) {
    normalizedRotation += 360;
  }

  // Scale modes fit the upright content into the output. For buffers that
  // need a 90°/270° rotation, the upright dimensions are swapped.
  bool isSideways = normalizedRotation == 90 || normalizedRotation == 270;
  if (isSideways) {
    sourceSize = sourceSize.yx;
  }

  float2 coordinate;
  switch (kScaleMode) {
    case 0u: { // 0u == ScaleMode::COVER
      float scale = max(outputSize.x / sourceSize.x, outputSize.y / sourceSize.y);
      float2 renderedSourceSizeInOutput = sourceSize * scale;
      float2 renderedSourceOffsetInOutput = (outputSize - renderedSourceSizeInOutput) * 0.5f;
      coordinate = ((outputCoordinate * outputSize) - renderedSourceOffsetInOutput) / renderedSourceSizeInOutput;
      break;
    }
    case 1u: { // 1u == ScaleMode::CONTAIN
      float scale = min(outputSize.x / sourceSize.x, outputSize.y / sourceSize.y);
      float2 renderedSourceSizeInOutput = sourceSize * scale;
      float2 renderedSourceOffsetInOutput = (outputSize - renderedSourceSizeInOutput) * 0.5f;
      coordinate = ((outputCoordinate * outputSize) - renderedSourceOffsetInOutput) / renderedSourceSizeInOutput;
      // Contain mode pads outside the rendered source with black bars.
      bool isOutsideSource = coordinate.x < 0.0f || coordinate.x > 1.0f || coordinate.y < 0.0f || coordinate.y > 1.0f;
      if (isOutsideSource) {
        return float3(0.0f);
      }
      break;
    }
    case 2u: { // 2u == ScaleMode::STRETCH
      // Independent per-axis stretching: the entire source [0,1]^2 maps to the
      // entire output [0,1]^2. Aspect ratio is NOT preserved.
      coordinate = outputCoordinate;
      break;
    }
    default:
      // Unsupported ScaleMode ordinal. Return black so broken modes fail visibly at runtime.
      return float3(0.0f);
  }

  // Map output -> input by undoing rotation before undoing mirroring.
  // Mirroring is relative to the already-rotated, upright presentation.
  int inverseRotation = (360 - normalizedRotation) % 360;

  switch (inverseRotation) {
    case 90:  // counter-rotate +90°
      coordinate = float2(1.0f - coordinate.y, coordinate.x);
      break;
    case 180:  // counter-rotate 180°
      coordinate = float2(1.0f - coordinate.x, 1.0f - coordinate.y);
      break;
    case 270:  // counter-rotate -90°
      coordinate = float2(coordinate.y, 1.0f - coordinate.x);
      break;
    default:  // 0°
      break;
  }

  if (uniforms.isMirrored != 0u) {
    coordinate.x = 1.0f - coordinate.x;
  }

  float y = yTexture.sample(resizeSampler, coordinate).r;
  float2 uv = uvTexture.sample(resizeSampler, coordinate).rg;
  return yuvToRgb(y, uv);
}

/**
 * The color of one output pixel.
 *
 * `DownscaleFilter::BILINEAR` takes one bilinear sample at the pixel's center.
 * `DownscaleFilter::AREA` takes enough evenly spaced bilinear samples that
 * neighbouring samples are at most one source pixel apart, and averages them
 * (OpenCV's INTER_AREA). At exactly 2x every sample lands on a source pixel
 * center, which is a true box filter; an upscale keeps the single sample.
 */
inline float3 sampleRgb(
  texture2d<float, access::sample> yTexture,
  texture2d<float, access::sample> uvTexture,
  uint2 gid,
  constant ResizeUniforms& uniforms
) {
  float2 outputSize = float2(uniforms.outputWidth, uniforms.outputHeight);
  if (kDownscaleFilter != 1u) {
    return sampleRgbAt(yTexture, uvTexture, (float2(gid) + 0.5f) / outputSize, uniforms);
  }

  float2 sourceSize = float2(yTexture.get_width(), yTexture.get_height());
  int normalizedRotation = uniforms.rotationDegrees % 360;
  if (normalizedRotation < 0) {
    normalizedRotation += 360;
  }
  if (normalizedRotation == 90 || normalizedRotation == 270) {
    sourceSize = sourceSize.yx;
  }

  float2 sourcePixelsPerOutputPixel;
  switch (kScaleMode) {
    case 0u: // 0u == ScaleMode::COVER
      sourcePixelsPerOutputPixel = float2(1.0f / max(outputSize.x / sourceSize.x, outputSize.y / sourceSize.y));
      break;
    case 1u: // 1u == ScaleMode::CONTAIN
      sourcePixelsPerOutputPixel = float2(1.0f / min(outputSize.x / sourceSize.x, outputSize.y / sourceSize.y));
      break;
    default: // 2u == ScaleMode::STRETCH
      sourcePixelsPerOutputPixel = sourceSize / outputSize;
      break;
  }
  // The epsilon keeps an exact integer ratio from rounding up to an extra sample.
  uint2 taps = uint2(clamp(ceil(sourcePixelsPerOutputPixel - 0.001f), 1.0f, 8.0f));

  float3 sum = float3(0.0f);
  for (uint j = 0u; j < taps.y; j++) {
    for (uint i = 0u; i < taps.x; i++) {
      float2 offset = (float2(float(i), float(j)) + 0.5f) / float2(taps);
      sum += sampleRgbAt(yTexture, uvTexture, (float2(gid) + offset) / outputSize, uniforms);
    }
  }
  return sum / float(taps.x * taps.y);
}

inline float3 orderedColor(
  float3 rgb
) {
  switch (kChannelOrder) {
    case 0u: // 0u == ChannelOrder::RGB
      return rgb;
    case 1u: // 1u == ChannelOrder::BGR
      return rgb.bgr;
    default:
      // Unsupported ChannelOrder ordinal. Fall back to black so broken channel orders fail visibly at runtime.
      return float3(0.0f);
  }
}

inline uint outputIndex(
  uint2 gid,
  uint channelIndex,
  constant ResizeUniforms& uniforms
) {
  uint pixelIndex = (gid.y * uniforms.outputWidth) + gid.x;
  uint pixelCount = uniforms.outputWidth * uniforms.outputHeight;

  switch (kPixelLayout) {
    case 0u: // 0u == PixelLayout::INTERLEAVED == HWC / NHWC
      return (pixelIndex * kChannelCount) + channelIndex;
    case 1u: // 1u == PixelLayout::PLANAR == CHW / NCHW
      return (channelIndex * pixelCount) + pixelIndex;
    default:
      // Unsupported PixelLayout ordinal. Fall back to index 0 so broken layouts fail visibly at runtime.
      return 0u;
  }
}

inline uchar quantizeUInt8(float value) {
  int quantized = int(rint(value * 255.0f));
  return uchar(clamp(quantized, 0, 255));
}

inline char quantizeInt8(float value) {
  int quantized = int(rint(value * 255.0f)) - 128;
  return char(clamp(quantized, -128, 127));
}

kernel void resize_uint8(
  texture2d<float, access::sample> yTexture [[texture(0)]],
  texture2d<float, access::sample> uvTexture [[texture(1)]],
  device uchar* output [[buffer(0)]],
  constant ResizeUniforms& uniforms [[buffer(1)]],
  uint2 gid [[thread_position_in_grid]]
) {
  if (gid.x >= uniforms.outputWidth || gid.y >= uniforms.outputHeight) {
    return;
  }

  float3 rgb = sampleRgb(yTexture, uvTexture, gid, uniforms);
  float3 ordered = orderedColor(rgb);

  for (uint channelIndex = 0u; channelIndex < kChannelCount; channelIndex++) {
    uint index = outputIndex(gid, channelIndex, uniforms);
    output[index] = quantizeUInt8(ordered[channelIndex]);
  }
}

kernel void resize_int8(
  texture2d<float, access::sample> yTexture [[texture(0)]],
  texture2d<float, access::sample> uvTexture [[texture(1)]],
  device char* output [[buffer(0)]],
  constant ResizeUniforms& uniforms [[buffer(1)]],
  uint2 gid [[thread_position_in_grid]]
) {
  if (gid.x >= uniforms.outputWidth || gid.y >= uniforms.outputHeight) {
    return;
  }

  float3 rgb = sampleRgb(yTexture, uvTexture, gid, uniforms);
  float3 ordered = orderedColor(rgb);

  for (uint channelIndex = 0u; channelIndex < kChannelCount; channelIndex++) {
    uint index = outputIndex(gid, channelIndex, uniforms);
    output[index] = quantizeInt8(ordered[channelIndex]);
  }
}

kernel void resize_float16(
  texture2d<float, access::sample> yTexture [[texture(0)]],
  texture2d<float, access::sample> uvTexture [[texture(1)]],
  device half* output [[buffer(0)]],
  constant ResizeUniforms& uniforms [[buffer(1)]],
  uint2 gid [[thread_position_in_grid]]
) {
  if (gid.x >= uniforms.outputWidth || gid.y >= uniforms.outputHeight) {
    return;
  }

  float3 rgb = sampleRgb(yTexture, uvTexture, gid, uniforms);
  float3 ordered = orderedColor(rgb);

  for (uint channelIndex = 0u; channelIndex < kChannelCount; channelIndex++) {
    uint index = outputIndex(gid, channelIndex, uniforms);
    output[index] = half(ordered[channelIndex]);
  }
}

kernel void resize_float32(
  texture2d<float, access::sample> yTexture [[texture(0)]],
  texture2d<float, access::sample> uvTexture [[texture(1)]],
  device float* output [[buffer(0)]],
  constant ResizeUniforms& uniforms [[buffer(1)]],
  uint2 gid [[thread_position_in_grid]]
) {
  if (gid.x >= uniforms.outputWidth || gid.y >= uniforms.outputHeight) {
    return;
  }

  float3 rgb = sampleRgb(yTexture, uvTexture, gid, uniforms);
  float3 ordered = orderedColor(rgb);

  for (uint channelIndex = 0u; channelIndex < kChannelCount; channelIndex++) {
    uint index = outputIndex(gid, channelIndex, uniforms);
    output[index] = ordered[channelIndex];
  }
}
