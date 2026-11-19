///
/// VulkanResizerShaderConfig.hpp
/// VisionCamera
/// Copyright © 2026 Marc Rousavy @ Margelo
///

#pragma once

#include "ResizerOptions.hpp"

#include <array>
#include <cstdint>
#include <optional>

#include <vulkan/vulkan.h>

namespace margelo::nitro::camera::resizer::vulkan::shader_config {

/**
 * Packed specialization constants that define the fixed output contract for one resizer pipeline.
 */
struct ShaderSpecializationData final {
  uint32_t dataType;
  uint32_t channelOrder;
  uint32_t pixelLayout;
  uint32_t channelCount;
  uint32_t scaleMode;
  uint32_t downscaleFilter;

  [[nodiscard]] static ShaderSpecializationData make(const ResizerOptions& options);
  [[nodiscard]] VkSpecializationInfo asVkInfo() const noexcept;

private:
  [[nodiscard]] static uint32_t getDataTypeOrdinal(DataType dataType);
  [[nodiscard]] static uint32_t getChannelOrderOrdinal(ChannelOrder channelOrder);
  [[nodiscard]] static uint32_t getPixelLayoutOrdinal(PixelLayout pixelLayout);
  [[nodiscard]] static uint32_t getScaleModeOrdinal(ScaleMode scaleMode);
  [[nodiscard]] static uint32_t getDownscaleFilterOrdinal(std::optional<DownscaleFilter> downscaleFilter);
};
static_assert(sizeof(ShaderSpecializationData) == 24, "ShaderSpecializationData must stay tightly packed.");

/**
 * Packed per-dispatch inputs that vary frame to frame while the pipeline stays fixed.
 */
struct ShaderPushConstants final {
  uint32_t outputWidth;
  uint32_t outputHeight;
  int32_t rotationDegrees;
  uint32_t isMirrored;

  [[nodiscard]] static ShaderPushConstants make(uint32_t outputWidth, uint32_t outputHeight, int32_t rotationDegrees, bool isMirrored);
};
static_assert(sizeof(ShaderPushConstants) == 16, "ShaderPushConstants must stay tightly packed.");

} // namespace margelo::nitro::camera::resizer::vulkan::shader_config
