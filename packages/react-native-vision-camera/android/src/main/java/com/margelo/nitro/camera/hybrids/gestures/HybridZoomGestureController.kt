package com.margelo.nitro.camera.hybrids.gestures

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import androidx.camera.core.Camera
import com.margelo.nitro.NitroModules
import com.margelo.nitro.camera.HybridCameraControllerSpec
import com.margelo.nitro.camera.HybridZoomGestureControllerSpec
import com.margelo.nitro.camera.ListenerSubscription
import com.margelo.nitro.camera.hybrids.HybridCameraController
import com.margelo.nitro.camera.public.NativeGestureController
import kotlin.math.max
import kotlin.math.min

class HybridZoomGestureController :
  HybridZoomGestureControllerSpec(),
  NativeGestureController {
  companion object {
    private const val MAX_ZOOM_FACTOR = 15f
  }

  override var controller: HybridCameraControllerSpec? = null

  private val context: Context
    get() = NitroModules.applicationContext ?: throw Error("Context not available!")
  private var initialZoomFactor = 1f
  private var isPinching = false
  private val onZoomChangedListeners = mutableSetOf<(Double) -> Unit>()
  private val camera: Camera?
    get() {
      val controller = controller as? HybridCameraController ?: return null
      return controller.camera
    }

  private val gestureDetector =
    ScaleGestureDetector(
      context,
      object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
        override fun onScaleBegin(detector: ScaleGestureDetector): Boolean {
          val zoomState =
            camera?.cameraInfo?.zoomState?.value
              ?: return false

          initialZoomFactor = zoomState.zoomRatio
          isPinching = true
          return super.onScaleBegin(detector)
        }

        override fun onScale(detector: ScaleGestureDetector): Boolean {
          val camera = camera ?: return false
          val zoomState =
            camera.cameraInfo.zoomState.value
              ?: return false

          val targetFactor = initialZoomFactor * detector.scaleFactor
          val minZoom = zoomState.minZoomRatio
          val maxZoom = min(zoomState.maxZoomRatio, MAX_ZOOM_FACTOR)
          val zoom = min(max(targetFactor, minZoom), maxZoom)

          onZoomChangedListeners.toList().forEach { it(zoom.toDouble()) }
          camera.cameraControl.setZoomRatio(zoom)
          return super.onScale(detector)
        }

        override fun onScaleEnd(detector: ScaleGestureDetector) {
          isPinching = false
          super.onScaleEnd(detector)
        }
      },
      Handler(Looper.getMainLooper()),
    )

  override fun onTouchEvent(
    view: View,
    event: MotionEvent,
  ): Boolean {
    if (controller == null) {
      // No controller, we can ignore touches.
      return false
    }

    // Let the gesture detector pick up the touch event
    gestureDetector.onTouchEvent(event)

    // Decide whether we want to continue receiving touches or if we can free it up to the parent
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        // tap started; start receiving touches
        return true
      }
      MotionEvent.ACTION_POINTER_DOWN -> {
        // multi-touch started: ask parent not to intercept
        view.parent?.requestDisallowInterceptTouchEvent(true)
        return true
      }
      MotionEvent.ACTION_MOVE -> {
        // fingers moved; continue receiving touches if we are in a pinch state, otherwise it might be a scroll.
        if (event.pointerCount > 1 || isPinching) {
          view.parent?.requestDisallowInterceptTouchEvent(true)
          return true
        }
        return false
      }
      MotionEvent.ACTION_POINTER_UP -> {
        // 1 finger released - keep receiving touches if we are still pinching
        return (event.pointerCount > 1) || isPinching
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        // all fingers are released/canceled, stop pinching
        isPinching = false
        return false
      }
      else -> {
        // whatever
        return (event.pointerCount > 1) || isPinching
      }
    }
  }

  override fun addOnZoomChangedListener(onZoomChanged: (Double) -> Unit): ListenerSubscription {
    onZoomChangedListeners.add(onZoomChanged)
    return ListenerSubscription {
      onZoomChangedListeners.remove(onZoomChanged)
    }
  }
}
