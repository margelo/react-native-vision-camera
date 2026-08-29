package com.margelo.nitro.camera.hybrids.orientation

import android.os.Build
import android.util.Log
import android.view.OrientationEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.margelo.nitro.NitroModules
import com.margelo.nitro.camera.CameraOrientation
import com.margelo.nitro.camera.HybridOrientationManagerSpec
import com.margelo.nitro.camera.OrientationSource
import com.margelo.nitro.camera.extensions.counterRotated
import com.margelo.nitro.camera.extensions.fromDegrees
import com.margelo.nitro.camera.extensions.fromSurfaceRotation

class HybridDeviceOrientationManager : HybridOrientationManagerSpec() {
  override val source: OrientationSource = OrientationSource.DEVICE
  override var currentOrientation: CameraOrientation? = null
    private set
  private val context: ReactApplicationContext
    get() = NitroModules.applicationContext ?: throw Error("No Context available!")
  private var orientationListener: OrientationEventListener? = null

  init {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      // Use interface orientation as a default device orientation, it may change later.
      val activity = context.currentActivity
      if (activity != null) {
        val surfaceRotation = activity.display.rotation
        currentOrientation = CameraOrientation.fromSurfaceRotation(surfaceRotation)
      }
    }
  }

  override fun startOrientationUpdates(onChanged: (orientation: CameraOrientation) -> Unit) {
    orientationListener?.disable()
    currentOrientation?.let(onChanged)
    orientationListener =
      object : OrientationEventListener(context) {
        override fun onOrientationChanged(rotationDegrees: Int) {
          if (orientationListener !== this) return
          if (rotationDegrees == ORIENTATION_UNKNOWN) {
            // phone is laying flat - orientation is unknown! Avoid sending out event.
            return
          }
          val orientation = CameraOrientation.fromDegrees(rotationDegrees).counterRotated()
          if (currentOrientation != orientation) {
            Log.i(TAG, "Device orientation changed! $orientation")
            currentOrientation = orientation
            onChanged(orientation)
          }
        }
      }
    orientationListener?.enable()
  }

  override fun stopOrientationUpdates() {
    val listener = orientationListener
    orientationListener = null
    listener?.disable()
  }
}
