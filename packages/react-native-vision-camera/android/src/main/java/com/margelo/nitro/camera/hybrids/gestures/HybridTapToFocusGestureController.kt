package com.margelo.nitro.camera.hybrids.gestures

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import androidx.camera.core.Camera
import androidx.camera.core.FocusMeteringAction
import androidx.camera.view.PreviewView
import com.margelo.nitro.NitroModules
import com.margelo.nitro.camera.FocusOptions
import com.margelo.nitro.camera.HybridCameraControllerSpec
import com.margelo.nitro.camera.HybridMeteringPointSpec
import com.margelo.nitro.camera.HybridTapToFocusGestureControllerSpec
import com.margelo.nitro.camera.ListenerSubscription
import com.margelo.nitro.camera.hybrids.HybridCameraController
import com.margelo.nitro.camera.hybrids.metering.HybridMeteringPoint
import com.margelo.nitro.camera.public.NativeGestureController

class HybridTapToFocusGestureController :
  HybridTapToFocusGestureControllerSpec(),
  NativeGestureController {
  override var controller: HybridCameraControllerSpec? = null

  private var previewView: PreviewView? = null
  private val onTapListeners = mutableSetOf<(HybridMeteringPointSpec) -> Unit>()
  private val onFocusCompletedListeners = mutableSetOf<(HybridMeteringPointSpec) -> Unit>()
  private val context: Context
    get() = NitroModules.applicationContext ?: throw Error("Context not available!")
  private var isTracking = false
  private val gestureDetector =
    GestureDetector(
      context,
      object : GestureDetector.SimpleOnGestureListener() {
        override fun onDown(e: MotionEvent): Boolean {
          return true
        }

        override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
          val previewView =
            previewView
              ?: return false
          val controller = controller ?: return false

          val point = previewView.meteringPointFactory.createPoint(e.x, e.y)
          val density = context.resources.displayMetrics.density
          val meteringPoint = HybridMeteringPoint((e.x / density).toDouble(), (e.y / density).toDouble(), null, point)
          onTapListeners.toList().forEach { it(meteringPoint) }
          controller
            .focusTo(meteringPoint, FocusOptions(null, null, null, null))
            .then {
              onFocusCompletedListeners.toList().forEach { it(meteringPoint) }
            }.catch { error ->
              Log.e(TAG, "Failed to focus!", error)
            }
          return true
        }
      },
      Handler(Looper.getMainLooper()),
    )

  override fun onTouchEvent(
    view: View,
    event: MotionEvent,
  ): Boolean {
    if (controller == null) {
      // No controller available
      return false
    }
    if (view !is PreviewView) {
      Log.e(TAG, "Received a tap on a View that is not a PreviewView! Tap To Focus cannot handle this.")
      return false
    }
    previewView = view

    if (event.pointerCount > 1) {
      // It's a multi-touch, ignore it
      isTracking = false
      return false
    }

    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        // Finger down
        isTracking = true
        gestureDetector.onTouchEvent(event)
        return true
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        // Finger up again
        gestureDetector.onTouchEvent(event)
        isTracking = false
        return true
      }
      else -> {
        if (isTracking) {
          // continue tracking this event - whatever it is
          gestureDetector.onTouchEvent(event)
          return true
        }
        return false
      }
    }
  }

  override fun addOnTapListener(onTap: (HybridMeteringPointSpec) -> Unit): ListenerSubscription {
    onTapListeners.add(onTap)
    return ListenerSubscription {
      onTapListeners.remove(onTap)
    }
  }

  override fun addOnFocusCompletedListener(onFocusCompleted: (HybridMeteringPointSpec) -> Unit): ListenerSubscription {
    onFocusCompletedListeners.add(onFocusCompleted)
    return ListenerSubscription {
      onFocusCompletedListeners.remove(onFocusCompleted)
    }
  }
}
