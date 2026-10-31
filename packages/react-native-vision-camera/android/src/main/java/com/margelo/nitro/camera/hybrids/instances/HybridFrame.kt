package com.margelo.nitro.camera.hybrids.instances

import android.graphics.Matrix
import androidx.camera.core.ImageProxy
import com.margelo.nitro.camera.CameraOrientation
import com.margelo.nitro.camera.HybridFramePlaneSpec
import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.camera.NativeBuffer
import com.margelo.nitro.camera.PixelFormat
import com.margelo.nitro.camera.Point
import com.margelo.nitro.camera.extensions.DisposableArrayBuffer
import com.margelo.nitro.camera.extensions.convertPoint
import com.margelo.nitro.camera.extensions.getNativeBuffer
import com.margelo.nitro.camera.extensions.getPixelBuffer
import com.margelo.nitro.camera.extensions.hasNativeBuffer
import com.margelo.nitro.camera.extensions.hasPixelBuffer
import com.margelo.nitro.camera.extensions.mapToArray
import com.margelo.nitro.camera.extensions.pixelFormat
import com.margelo.nitro.camera.public.NativeFrame
import com.margelo.nitro.core.ArrayBuffer

class HybridFrame(
  override val image: ImageProxy,
  override val orientation: CameraOrientation,
  override val isMirrored: Boolean,
  override val cameraIntrinsicMatrix: DoubleArray?,
) : HybridFrameSpec(),
  NativeFrame {
  override val timestamp: Double
    get() = image.imageInfo.timestamp.toDouble()
  override val isValid: Boolean
    get() {
      try {
        // accessing format on a Closed Image might throw
        image.format
        return true
      } catch (_: Throwable) {
        return false
      }
    }
  override val width: Double
    get() = image.width.toDouble()
  override val height: Double
    get() = image.height.toDouble()
  override val bytesPerRow: Double
    get() {
      val onlyPlane =
        image.planes.singleOrNull()
          ?: return 0.0
      return onlyPlane.rowStride.toDouble()
    }
  override val pixelFormat: PixelFormat
    get() = image.pixelFormat
  override val isPlanar: Boolean
    get() = image.planes.size > 1
  override val hasPixelBuffer: Boolean
    get() = image.hasPixelBuffer
  override val hasNativeBuffer: Boolean
    get() = image.hasNativeBuffer

  override val memorySize: Long
    get() = image.width * image.height * 4L

  override fun dispose() {
    super.dispose()
    planesCached?.forEach { it.dispose() }
    cachedPixelBuffer?.dispose()
    image.close()
  }

  override fun getNativeBuffer(): NativeBuffer {
    return image.getNativeBuffer()
  }

  private var planesCached: Array<HybridFramePlaneSpec>? = null

  override fun getPlanes(): Array<HybridFramePlaneSpec> {
    planesCached?.let {
      // we have planes cached
      return it
    }
    val planes: Array<HybridFramePlaneSpec> = image.planes.mapToArray { HybridFramePlane(it) }
    planesCached = planes
    return planes
  }

  private var cachedPixelBuffer: DisposableArrayBuffer? = null

  override fun getPixelBuffer(): ArrayBuffer {
    cachedPixelBuffer?.let {
      // We already have it cached
      return it.arrayBuffer
    }
    val pixelBuffer = image.getPixelBuffer()
    cachedPixelBuffer = pixelBuffer
    return pixelBuffer.arrayBuffer
  }

  override fun convertCameraPointToFramePoint(cameraPoint: Point): Point {
    val sensorToBuffer = image.imageInfo.sensorToBufferTransformMatrix
    return sensorToBuffer.convertPoint(cameraPoint)
  }

  override fun convertFramePointToCameraPoint(framePoint: Point): Point {
    val bufferToSensor =
      Matrix().apply {
        image.imageInfo.sensorToBufferTransformMatrix.invert(this)
      }
    return bufferToSensor.convertPoint(framePoint)
  }
}
