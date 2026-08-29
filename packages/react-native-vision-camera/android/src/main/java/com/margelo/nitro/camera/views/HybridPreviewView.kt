package com.margelo.nitro.camera.views

import android.graphics.Matrix
import android.util.Log
import android.view.MotionEvent
import android.view.View
import androidx.annotation.UiThread
import androidx.camera.core.MeteringPointFactory
import androidx.camera.view.PreviewView
import androidx.lifecycle.Observer
import com.facebook.react.uimanager.ThemedReactContext
import com.margelo.nitro.camera.HybridCameraPreviewOutputSpec
import com.margelo.nitro.camera.HybridGestureControllerSpec
import com.margelo.nitro.camera.HybridMeteringPointSpec
import com.margelo.nitro.camera.HybridPreviewViewSpec
import com.margelo.nitro.camera.HybridScannedObjectSpec
import com.margelo.nitro.camera.HybridZoomGestureControllerSpec
import com.margelo.nitro.camera.Point
import com.margelo.nitro.camera.PreviewImplementationMode
import com.margelo.nitro.camera.PreviewResizeMode
import com.margelo.nitro.camera.extensions.convertPoint
import com.margelo.nitro.camera.extensions.converters.toImplementationMode
import com.margelo.nitro.camera.extensions.converters.toScaleType
import com.margelo.nitro.camera.extensions.installHierarchyFitter
import com.margelo.nitro.camera.hybrids.metering.HybridMeteringPoint
import com.margelo.nitro.camera.public.NativeGestureController
import com.margelo.nitro.camera.public.NativePreviewOutput
import com.margelo.nitro.core.Promise
import com.margelo.nitro.image.HybridImage
import com.margelo.nitro.image.HybridImageSpec
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class HybridPreviewView(
  val context: ThemedReactContext,
) : HybridPreviewViewSpec(),
  View.OnTouchListener,
  Observer<PreviewView.StreamState> {
  private val previewView = PreviewView(context)
  private val uiScope = CoroutineScope(Dispatchers.Main.immediate)
  override val view: View
    get() = previewView
  override var previewOutput: HybridCameraPreviewOutputSpec? = null
    set(newValue) {
      // 1. Disconnect the old Preview Output
      field?.let { oldPreview ->
        uiScope.launch {
          disconnectPreviewOutput(oldPreview)
        }
      }
      // 2. Update the field
      field = newValue
      // 3. Connect the new Value
      newValue?.let { newPreview ->
        uiScope.launch {
          connectPreviewOutput(newPreview)
        }
      }
    }
  override var onPreviewStarted: (() -> Unit)? = null
  override var onPreviewStopped: (() -> Unit)? = null
  override var implementationMode: PreviewImplementationMode? = PreviewImplementationMode.PERFORMANCE
    set(newValue) {
      val newImplementationMode = newValue ?: PreviewImplementationMode.PERFORMANCE
      if (newImplementationMode != field) {
        field = newImplementationMode
        uiScope.launch {
          // Update ImplementationMode and reconnect output
          previewView.implementationMode = newImplementationMode.toImplementationMode()
          previewOutput?.let { previewOutput -> connectPreviewOutput(previewOutput) }
        }
      }
    }
  override var gestureControllers: Array<HybridGestureControllerSpec>? = null
  override var resizeMode: PreviewResizeMode? = PreviewResizeMode.COVER
    set(newValue) {
      val newResizeMode = newValue ?: PreviewResizeMode.COVER
      if (newResizeMode != field) {
        field = newResizeMode
        uiScope.launch {
          // Update scaleType
          previewView.scaleType = newResizeMode.toScaleType()
        }
      }
    }
  private var isPreviewing: Boolean = false
  private val meteringPointFactory: MeteringPointFactory
  private var cameraSpaceToViewPixelsMatrix: Matrix? = null
  private val pixelRatio: Float

  init {
    previewView.installHierarchyFitter()
    previewView.previewStreamState.observeForever(this)
    previewView.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
      updateCameraSpaceToViewPixelsMatrix()
    }
    previewView.setOnTouchListener(this)
    meteringPointFactory = previewView.meteringPointFactory
    pixelRatio = context.resources.displayMetrics.density
  }

  override fun dispose() {
    super.dispose()
    previewView.previewStreamState.removeObserver(this)
  }

  override fun createMeteringPoint(
    viewX: Double,
    viewY: Double,
    size: Double?,
  ): HybridMeteringPointSpec {
    val absoluteViewX = viewX * pixelRatio
    val absoluteViewY = viewY * pixelRatio
    val meteringPoint =
      if (size != null) {
        meteringPointFactory.createPoint(absoluteViewX.toFloat(), absoluteViewY.toFloat(), size.toFloat())
      } else {
        meteringPointFactory.createPoint(absoluteViewX.toFloat(), absoluteViewY.toFloat())
      }
    return HybridMeteringPoint(
      viewX,
      viewY,
      size,
      meteringPoint,
    )
  }

  override fun takeSnapshot(): Promise<HybridImageSpec> {
    return Promise.async(uiScope) {
      val bitmap =
        previewView.bitmap
          ?: throw Error("Cannot take snapshot - PreviewView isn't ready yet!")
      return@async HybridImage(bitmap)
    }
  }

  override fun convertCameraPointToViewPoint(cameraPoint: Point): Point {
    val matrix =
      cameraSpaceToViewPixelsMatrix
        ?: throw Error("Cannot convert camera point to view point - PreviewView isn't ready yet!")
    val viewPixels = matrix.convertPoint(cameraPoint)
    return Point(
      viewPixels.x / pixelRatio,
      viewPixels.y / pixelRatio,
    )
  }

  override fun convertViewPointToCameraPoint(viewPoint: Point): Point {
    val matrix =
      cameraSpaceToViewPixelsMatrix
        ?: throw Error("Cannot convert view point to camera point - PreviewView isn't ready yet!")
    val inverted = Matrix()
    matrix.invert(inverted)
    val viewPixels =
      Point(
        viewPoint.x * pixelRatio,
        viewPoint.y * pixelRatio,
      )
    return inverted.convertPoint(viewPixels)
  }

  override fun convertScannedObjectCoordinatesToViewCoordinates(scannedObject: HybridScannedObjectSpec): HybridScannedObjectSpec {
    throw Error("Transforming Scanned Objects into View Coordinates is not supported on Android!")
  }

  @UiThread
  private fun connectPreviewOutput(previewOutput: HybridCameraPreviewOutputSpec) {
    // 1. Downcast
    val previewOutput = previewOutput as? NativePreviewOutput ?: throw Error("PreviewOutput is not of type `NativePreviewOutput`!")
    // 2. Set surfaceProvider on UI Thread
    previewOutput.setSurfaceProvider(previewView.surfaceProvider)
  }

  @UiThread
  private fun disconnectPreviewOutput(previewOutput: HybridCameraPreviewOutputSpec) {
    // 1. Downcast
    val previewOutput = previewOutput as? NativePreviewOutput ?: throw Error("PreviewOutput is not of type `NativePreviewOutput`!")
    // 2. Remove surfaceProvider on UI Thread
    previewOutput.removeSurfaceProvider(previewView.surfaceProvider)
  }

  override fun onChanged(value: PreviewView.StreamState) {
    val isPreviewing = value == PreviewView.StreamState.STREAMING
    updateCameraSpaceToViewPixelsMatrix()
    if (this.isPreviewing != isPreviewing) {
      if (isPreviewing) {
        Log.i(TAG, "PreviewView started!")
        onPreviewStarted?.invoke()
      } else {
        Log.i(TAG, "PreviewView stopped!")
        onPreviewStopped?.invoke()
      }
    }
    this.isPreviewing = isPreviewing
  }

  // This matrix maps CameraX sensor coordinates to Android view pixels.
  // It has to be updated when the PreviewView's layout changes,
  // we cannot access it directly from `convertCameraPointToViewPoint` each time
  // since it's accessible from the UI-Thread only.
  private fun updateCameraSpaceToViewPixelsMatrix() {
    val matrix =
      previewView.sensorToViewTransform
        ?: return
    this.cameraSpaceToViewPixelsMatrix = matrix
  }

  override fun onTouch(
    view: View,
    event: MotionEvent,
  ): Boolean {
    // Handle gestures
    for (controller in gestureControllers ?: emptyArray()) {
      if (controller is NativeGestureController) {
        val shouldReceiveTouches = controller.onTouchEvent(view, event)
        if (shouldReceiveTouches) return true
      }
    }

    // no handled gesture
    return false
  }
}
