package com.margelo.nitro.camera.hybrids.instances

import android.graphics.Matrix
import androidx.camera.core.ImageProxy
import com.margelo.nitro.camera.CameraOrientation
import com.margelo.nitro.camera.DepthDataAccuracy
import com.margelo.nitro.camera.DepthDataQuality
import com.margelo.nitro.camera.DepthPixelFormat
import com.margelo.nitro.camera.HybridCameraCalibrationDataSpec
import com.margelo.nitro.camera.HybridDepthSpec
import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.camera.NativeBuffer
import com.margelo.nitro.camera.Point
import com.margelo.nitro.camera.extensions.DisposableArrayBuffer
import com.margelo.nitro.camera.extensions.convertPoint
import com.margelo.nitro.camera.extensions.depthPixelFormat
import com.margelo.nitro.camera.extensions.getNativeBuffer
import com.margelo.nitro.camera.extensions.getPixelBuffer
import com.margelo.nitro.camera.public.NativeFrame
import com.margelo.nitro.core.ArrayBuffer
import com.margelo.nitro.core.Promise

class HybridDepthFrame(
  override val image: ImageProxy,
  override val orientation: CameraOrientation,
  override val isMirrored: Boolean,
) : HybridDepthSpec(),
  NativeFrame {
  override val timestamp: Double
    get() = image.imageInfo.timestamp.toDouble()

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
  override val pixelFormat: DepthPixelFormat
    get() = image.depthPixelFormat

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
  override val isDepthDataFiltered: Boolean
    get() = false
  override val depthDataAccuracy: DepthDataAccuracy
    get() = DepthDataAccuracy.ABSOLUTE
  override val depthDataQuality: DepthDataQuality
    get() = DepthDataQuality.UNKNOWN
  override val availableDepthPixelFormats: Array<DepthPixelFormat>
    get() = emptyArray()

  // TODO: Get CameraCalibrationData somehow?
  override val cameraCalibrationData: HybridCameraCalibrationDataSpec?
    get() = null

  private var cachedPixelBuffer: DisposableArrayBuffer? = null

  override fun getDepthData(): ArrayBuffer {
    cachedPixelBuffer?.let {
      // We have it cached
      return it.arrayBuffer
    }
    val pixelBuffer = image.getPixelBuffer()
    cachedPixelBuffer = pixelBuffer
    return pixelBuffer.arrayBuffer
  }

  override fun getNativeBuffer(): NativeBuffer {
    return image.getNativeBuffer()
  }

  override fun rotate(
    orientation: CameraOrientation,
    isMirrored: Boolean,
  ): HybridDepthSpec {
    // TODO: On Android this is simply not supported.
    //       We need to specify the rotation upfront -
    //       maybe time to re-design the API?
    throw Error("Rotating Depth Buffers is not supported!")
  }

  override fun rotateAsync(
    orientation: CameraOrientation,
    isMirrored: Boolean,
  ): Promise<HybridDepthSpec> {
    return Promise.async { rotate(orientation, isMirrored) }
  }

  override fun convert(pixelFormat: DepthPixelFormat): HybridDepthSpec {
    // TODO: On Android this is simply not supported.
    //       We need to specify the Pixel Format upfront when creating the ImageReader -
    //       maybe time to re-design the API?
    throw Error("Depth Data conversion to $pixelFormat is not supported!")
  }

  override fun convertAsync(pixelFormat: DepthPixelFormat): Promise<HybridDepthSpec> {
    return Promise.async { convert(pixelFormat) }
  }

  override fun convertCameraPointToDepthPoint(cameraPoint: Point): Point {
    val sensorToBuffer = image.imageInfo.sensorToBufferTransformMatrix
    return sensorToBuffer.convertPoint(cameraPoint)
  }

  override fun convertDepthPointToCameraPoint(depthPoint: Point): Point {
    val bufferToSensor =
      Matrix().apply {
        image.imageInfo.sensorToBufferTransformMatrix.invert(this)
      }
    return bufferToSensor.convertPoint(depthPoint)
  }

  override fun toFrame(): HybridFrameSpec {
    return HybridFrame(image, orientation, isMirrored, null)
  }

  override fun toFrameAsync(): Promise<HybridFrameSpec> {
    return Promise.async { toFrame() }
  }

  override val memorySize: Long
    get() = image.width * image.height * 4L

  override fun dispose() {
    super.dispose()
    image.close()
    cachedPixelBuffer?.dispose()
  }
}
