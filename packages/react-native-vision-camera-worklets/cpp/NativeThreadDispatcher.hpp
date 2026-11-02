///
/// NativeThreadDispatcher.hpp
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

#pragma once

#include "JSIConverter+AsyncQueue.hpp"
#include <NitroModules/NitroLogger.hpp>
#include <VisionCamera/HybridNativeThreadSpec.hpp>
#include <exception>
#include <jsi/jsi.h>

namespace margelo::nitro::camera::worklets {

/**
 * An implementation of `nitro::Dispatcher` that uses a `NativeThread` to run its jobs.
 *
 * The `NativeThread` (`HybridNativeThreadSpec`) is a platform-implemented object,
 * e.g. using `DispatchQueue` on iOS.
 */
class NativeThreadDispatcher : public nitro::Dispatcher {
public:
  NativeThreadDispatcher(std::shared_ptr<HybridNativeThreadSpec> thread) : _thread(std::move(thread)) {}

  void runSync(std::function<void()>&&) override {
    throw std::runtime_error("runSync(...) is not implemented for NativeThreadDispatcher!");
  }
  void runAsync(std::function<void()>&& function) override {
    try {
      _thread->runOnThread(function);
    } catch (const std::exception& error) {
      // The NativeThread no longer accepts work (e.g. its output was disposed).
      // Native callers (like Promise resolvers) cannot handle this, so drop the job.
      Logger::log(LogLevel::Warning, "NativeThreadDispatcher", "Dropped a job: %s", error.what());
    }
  }

private:
  std::shared_ptr<HybridNativeThreadSpec> _thread;
};

} // namespace margelo::nitro::camera::worklets
