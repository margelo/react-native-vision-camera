package com.margelo.nitro.camera.session

import androidx.camera.core.Camera
import com.margelo.nitro.camera.InterruptionReason
import java.io.Closeable

interface ActiveCameraSession : Closeable {
  interface LifecycleListener {
    fun onStarted()

    fun onStopped()

    fun onError(error: Throwable)

    fun onInterruptionStarted(reason: InterruptionReason)

    fun onInterruptionEnded()
  }

  val isRunning: Boolean
  val cameras: List<Camera>
}
