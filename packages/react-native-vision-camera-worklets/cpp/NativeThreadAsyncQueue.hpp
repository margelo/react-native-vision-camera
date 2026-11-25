///
/// NativeThreadAsyncQueue.hpp
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
 * An implementation of `worklets::AsyncQueue` that uses a `NativeThread` to run its jobs.
 *
 * The `NativeThread` (`HybridNativeThreadSpec`) is a platform-implemented object,
 * e.g. using `DispatchQueue` on iOS.
 */
class NativeThreadAsyncQueue : public ::worklets::AsyncQueue {
public:
  explicit NativeThreadAsyncQueue(std::shared_ptr<HybridNativeThreadSpec> thread) : _thread(std::move(thread)) {}

  void push(std::function<void()>&& job) override {
    auto jobCopy = job;
    try {
      _thread->runOnThread(jobCopy);
    } catch (const std::exception& error) {
      // The NativeThread no longer accepts work (e.g. its output was disposed).
      // Native callers (like timers) cannot handle this, so drop the job.
      Logger::log(LogLevel::Warning, "NativeThreadAsyncQueue", "Dropped a job: %s", error.what());
    }
  }

private:
  std::shared_ptr<HybridNativeThreadSpec> _thread;
};

} // namespace margelo::nitro::camera::worklets
