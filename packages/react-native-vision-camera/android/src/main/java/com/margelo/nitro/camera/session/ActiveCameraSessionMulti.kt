package com.margelo.nitro.camera.session

import androidx.camera.core.Camera
import androidx.camera.core.ConcurrentCamera
import com.margelo.nitro.camera.InterruptionReason
import java.io.Closeable

class ActiveCameraSessionMulti(
  private val camera: ConcurrentCamera,
  private val listener: ActiveCameraSession.LifecycleListener,
) : ActiveCameraSession,
  ActiveCameraSession.LifecycleListener,
  Closeable {
  override val isRunning: Boolean
    get() = singleSessions.any { it.isRunning }
  override val cameras: List<Camera>
    get() = camera.cameras

  private val singleSessions = camera.cameras.map { ActiveCameraSessionSingle(it, this) }
  private var currentIsRunning: Boolean

  init {
    currentIsRunning = singleSessions.any { it.isRunning }
  }

  override fun close() {
    singleSessions.forEach { it.close() }
  }

  private fun onIsRunningChanged() {
    // collapses multiple onStarted() and onStopped() events into a single one
    if (currentIsRunning != isRunning) {
      if (!currentIsRunning && isRunning) {
        listener.onStarted()
      } else if (currentIsRunning && !isRunning) {
        listener.onStopped()
      }
      currentIsRunning = isRunning
    }
  }

  override fun onStarted() {
    onIsRunningChanged()
  }

  override fun onStopped() {
    onIsRunningChanged()
  }

  override fun onError(error: Throwable) {
    listener.onError(error)
  }

  override fun onInterruptionStarted(reason: InterruptionReason) {
    listener.onInterruptionStarted(reason)
  }

  override fun onInterruptionEnded() {
    listener.onInterruptionEnded()
  }
}
