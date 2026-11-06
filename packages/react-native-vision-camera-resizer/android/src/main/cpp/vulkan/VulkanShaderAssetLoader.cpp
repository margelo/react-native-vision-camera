///
/// VulkanShaderAssetLoader.cpp
/// VisionCamera
/// Copyright © 2026 Marc Rousavy @ Margelo
///

#include "VulkanShaderAssetLoader.hpp"
#include "utils/AndroidAssetManager.hpp"

#include <android/asset_manager.h>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace margelo::nitro::camera::resizer::vulkan {

namespace {

  constexpr const char* kResizerComputeShaderAssetPath = "shaders/Resizer.comp.spv";

  std::vector<uint32_t> readSpirvAsset(AAssetManager* assetManager, const char* assetPath) {
    if (assetManager == nullptr) [[unlikely]] {
      throw std::runtime_error("Android asset manager is not available for Vulkan shader loading.");
    }

    // The shader is precompiled by Gradle and packaged as an app asset, so native code only needs to read the SPIR-V bytes.
    std::unique_ptr<AAsset, decltype(&AAsset_close)> asset(AAssetManager_open(assetManager, assetPath, AASSET_MODE_BUFFER), &AAsset_close);
    if (asset == nullptr) [[unlikely]] {
      throw std::runtime_error(std::string("Failed to open Vulkan shader asset `") + assetPath +
                               "`. Ensure Gradle shader precompilation packaged it into the app assets.");
    }

    const int64_t byteCount = AAsset_getLength64(asset.get());
    // Validate the asset up front so vkCreateShaderModule only ever sees well-formed SPIR-V input.
    if (byteCount <= 0) [[unlikely]] {
      throw std::runtime_error(std::string("Vulkan shader asset `") + assetPath + "` is empty.");
    }
    if ((byteCount % static_cast<int64_t>(sizeof(uint32_t))) != 0) [[unlikely]] {
      throw std::runtime_error(std::string("Vulkan shader asset `") + assetPath + "` is not 4-byte aligned SPIR-V data.");
    }

    std::vector<uint32_t> words(static_cast<size_t>(byteCount / static_cast<int64_t>(sizeof(uint32_t))));
    uint8_t* destination = reinterpret_cast<uint8_t*>(words.data());
    size_t totalBytesRead = 0;
    const size_t totalByteCount = static_cast<size_t>(byteCount);

    while (totalBytesRead < totalByteCount) {
      const int bytesRead = AAsset_read(asset.get(), destination + totalBytesRead, totalByteCount - totalBytesRead);
      if (bytesRead <= 0) [[unlikely]] {
        throw std::runtime_error(std::string("Failed to fully read Vulkan shader asset `") + assetPath + "`.");
      }
      totalBytesRead += static_cast<size_t>(bytesRead);
    }

    return words;
  }

} // namespace

const std::vector<uint32_t>& getResizerComputeShaderSpirv() {
  // Load the packaged shader once and reuse it for every pipeline instance in this process.
  static const std::vector<uint32_t> shaderWords =
      readSpirvAsset(margelo::nitro::camera::resizer::utils::AndroidAssetManager::getShared().get(), kResizerComputeShaderAssetPath);
  return shaderWords;
}

} // namespace margelo::nitro::camera::resizer::vulkan
