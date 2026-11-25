///
/// HybridResizer.cpp
/// VisionCamera
/// Copyright © 2026 Marc Rousavy @ Margelo
///

#include "HybridResizer.hpp"

#include "HybridGPUFrame.hpp"
#include "utils/ScopedNativeBuffer.hpp"

#include <stdexcept>

namespace margelo::nitro::camera::resizer {

namespace {

  /**
   * Convert the camera orientation enum into the rotation contract expected by the shader.
   */
  int orientationToDegrees(camera::CameraOrientation orientation) {
    switch (orientation) {
      case camera::CameraOrientation::UP:
        return 0;
      case camera::CameraOrientation::RIGHT:
        return 90;
      case camera::CameraOrientation::DOWN:
        return 180;
      case camera::CameraOrientation::LEFT:
        return 270;
    }

    throw std::runtime_error("Unknown Frame orientation: " + std::to_string(static_cast<int>(orientation)));
  }

} // namespace

HybridResizer::HybridResizer(const ResizerOptions& options) : HybridObject(TAG), _pipeline(std::make_unique<vulkan::VulkanResizerPipeline>(options)) {}

std::shared_ptr<HybridGPUFrameSpec> HybridResizer::resize(const std::shared_ptr<camera::HybridFrameSpec>& frame) {
  std::lock_guard<std::mutex> lock(_lifecycleMutex);

  if (_pipeline == nullptr) [[unlikely]] {
    throw std::runtime_error("This Resizer has already been disposed!");
  }

  // Keep the NativeBuffer alive while Vulkan borrows the underlying AHardwareBuffer pointer.
  ScopedNativeBuffer nativeBuffer(frame->getNativeBuffer());
  AHardwareBuffer* hardwareBuffer = nativeBuffer.getHardwareBuffer();
  if (hardwareBuffer == nullptr) [[unlikely]] {
    throw std::runtime_error("Frame NativeBuffer pointer (AHardwareBuffer*) is null!");
  }

  // Run the Vulkan compute pipeline with the given Frame HardwareBuffer.
  const int rotationDegrees = orientationToDegrees(frame->getOrientation());
  const bool isMirrored = frame->getIsMirrored();
  const std::shared_ptr<vulkan::VulkanBufferView> outputBufferView = _pipeline->run(hardwareBuffer, rotationDegrees, isMirrored);

  // Wrap the resulting Vulkan GPU buffer as a zero-copy GPUFrame.
  return std::make_shared<HybridGPUFrame>(std::move(outputBufferView));
}

void HybridResizer::dispose() {
  std::lock_guard<std::mutex> lock(_lifecycleMutex);

  if (_pipeline == nullptr) {
    return;
  }

  if (_pipeline->hasActiveOutputView()) [[unlikely]] {
    throw std::runtime_error("Previous GPUFrame is still active. Dispose it before disposing the Resizer.");
  }

  _pipeline = nullptr;
}

size_t HybridResizer::getExternalMemorySize() noexcept {
  // Also guarded: Nitro calls this from toObject() on arbitrary threads, and it is never called
  // from inside resize()/dispose(), so it cannot self-deadlock.
  std::lock_guard<std::mutex> lock(_lifecycleMutex);

  return _pipeline != nullptr ? _pipeline->getOutputBufferAllocationSize() : 0;
}

} // namespace margelo::nitro::camera::resizer
