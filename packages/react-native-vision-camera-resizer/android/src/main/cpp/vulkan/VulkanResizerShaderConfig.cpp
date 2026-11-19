///
/// VulkanResizerShaderConfig.cpp
/// VisionCamera
/// Copyright © 2026 Marc Rousavy @ Margelo
///

#include "vulkan/VulkanResizerShaderConfig.hpp"

#include "utils/OutputBufferLayout.hpp"

#include <cstddef>
#include <stdexcept>

namespace margelo::nitro::camera::resizer::vulkan::shader_config {

namespace {

  const std::array<VkSpecializationMapEntry, 6> kShaderSpecializationMapEntries = {
      VkSpecializationMapEntry{
          .constantID = 0,
          .offset = offsetof(ShaderSpecializationData, dataType),
          .size = sizeof(uint32_t),
      },
      VkSpecializationMapEntry{
          .constantID = 1,
          .offset = offsetof(ShaderSpecializationData, channelOrder),
          .size = sizeof(uint32_t),
      },
      VkSpecializationMapEntry{
          .constantID = 2,
          .offset = offsetof(ShaderSpecializationData, pixelLayout),
          .size = sizeof(uint32_t),
      },
      VkSpecializationMapEntry{
          .constantID = 3,
          .offset = offsetof(ShaderSpecializationData, channelCount),
          .size = sizeof(uint32_t),
      },
      VkSpecializationMapEntry{
          .constantID = 4,
          .offset = offsetof(ShaderSpecializationData, scaleMode),
          .size = sizeof(uint32_t),
      },
      VkSpecializationMapEntry{
          .constantID = 5,
          .offset = offsetof(ShaderSpecializationData, downscaleFilter),
          .size = sizeof(uint32_t),
      },
  };

} // namespace

ShaderSpecializationData ShaderSpecializationData::make(const ResizerOptions& options) {
  return ShaderSpecializationData{
      .dataType = getDataTypeOrdinal(options.dataType),
      .channelOrder = getChannelOrderOrdinal(options.channelOrder),
      .pixelLayout = getPixelLayoutOrdinal(options.pixelLayout),
      .channelCount = margelo::nitro::camera::resizer::utils::getChannelsPerPixel(options.channelOrder),
      .scaleMode = getScaleModeOrdinal(options.scaleMode),
      .downscaleFilter = getDownscaleFilterOrdinal(options.downscaleFilter),
  };
}

VkSpecializationInfo ShaderSpecializationData::asVkInfo() const noexcept {
  return VkSpecializationInfo{
      .mapEntryCount = static_cast<uint32_t>(kShaderSpecializationMapEntries.size()),
      .pMapEntries = kShaderSpecializationMapEntries.data(),
      .dataSize = sizeof(ShaderSpecializationData),
      .pData = this,
  };
}

uint32_t ShaderSpecializationData::getDataTypeOrdinal(DataType dataType) {
  switch (dataType) {
    case DataType::INT8:
      return 0u;
    case DataType::UINT8:
      return 1u;
    case DataType::FLOAT16:
      return 2u;
    case DataType::FLOAT32:
      return 3u;
  }

  throw std::runtime_error("Unsupported Resizer DataType.");
}

uint32_t ShaderSpecializationData::getChannelOrderOrdinal(ChannelOrder channelOrder) {
  switch (channelOrder) {
    case ChannelOrder::RGB:
      return 0u;
    case ChannelOrder::BGR:
      return 1u;
  }

  throw std::runtime_error("Unsupported Resizer ChannelOrder.");
}

uint32_t ShaderSpecializationData::getPixelLayoutOrdinal(PixelLayout pixelLayout) {
  switch (pixelLayout) {
    case PixelLayout::INTERLEAVED:
      return 0u;
    case PixelLayout::PLANAR:
      return 1u;
  }

  throw std::runtime_error("Unsupported Resizer PixelLayout.");
}

uint32_t ShaderSpecializationData::getScaleModeOrdinal(ScaleMode scaleMode) {
  switch (scaleMode) {
    case ScaleMode::COVER:
      return 0u;
    case ScaleMode::CONTAIN:
      return 1u;
    case ScaleMode::STRETCH:
      return 2u;
  }

  throw std::runtime_error("Unsupported Resizer ScaleMode.");
}
ShaderPushConstants ShaderPushConstants::make(uint32_t outputWidth, uint32_t outputHeight, int32_t rotationDegrees, bool isMirrored) {
  return ShaderPushConstants{
      .outputWidth = outputWidth,
      .outputHeight = outputHeight,
      .rotationDegrees = rotationDegrees,
      .isMirrored = isMirrored ? 1u : 0u,
  };
}

uint32_t ShaderSpecializationData::getDownscaleFilterOrdinal(std::optional<DownscaleFilter> downscaleFilter) {
  switch (downscaleFilter.value_or(DownscaleFilter::BILINEAR)) {
    case DownscaleFilter::BILINEAR:
      return 0u;
    case DownscaleFilter::AREA:
      return 1u;
  }

  throw std::runtime_error("Unsupported Resizer DownscaleFilter.");
}

} // namespace margelo::nitro::camera::resizer::vulkan::shader_config
