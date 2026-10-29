package com.margelo.nitro.camera.extensions

import android.hardware.HardwareBuffer
import android.os.Build
import androidx.camera.core.ImageProxy
import com.margelo.nitro.camera.utils.DirectByteBufferPool
import com.margelo.nitro.core.ArrayBuffer
import java.nio.ByteBuffer

val HardwareBuffer.isCpuReadable: Boolean
  get() {
    val readableUsageFlags = HardwareBuffer.USAGE_CPU_READ_RARELY or HardwareBuffer.USAGE_CPU_READ_OFTEN
    return (usage and readableUsageFlags) != 0L
  }

/**
 * Formats with a fixed bytes-per-pixel layout that can be exposed as a flat pixel buffer.
 * Everything else (YUV planes, BLOB, and the opaque `IMPLEMENTATION_DEFINED` format camera
 * HALs use for `PRIVATE` streams) has no single pixel layout, even when the usage flags say
 * the buffer is CPU-readable.
 */
private val hardwareBufferFormatsWithPixelLayout =
  intArrayOf(
    HardwareBuffer.RGBA_8888,
    HardwareBuffer.RGBX_8888,
    HardwareBuffer.RGB_888,
    HardwareBuffer.RGB_565,
    HardwareBuffer.RGBA_FP16,
    HardwareBuffer.RGBA_1010102,
    HardwareBuffer.D_16,
    HardwareBuffer.D_24,
    HardwareBuffer.DS_24UI8,
    HardwareBuffer.D_FP32,
    HardwareBuffer.DS_FP32UI8,
    HardwareBuffer.S_UI8,
    HardwareBuffer.R_8,
    HardwareBuffer.RGBA_10101010,
  )

val HardwareBuffer.isCpuReadablePixelBuffer: Boolean
  get() = isCpuReadable && hardwareBufferFormatsWithPixelLayout.contains(format)

val ImageProxy.hasPixelBuffer: Boolean
  get() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      hardwareBuffer?.use { hardwareBuffer ->
        if (hardwareBuffer.isCpuReadablePixelBuffer) {
          // We have CPU-readable GPU-backed Pixel Data.
          return true
        }
      }
    }
    // We have CPU-accessible planes.
    return planes.isNotEmpty()
  }

data class DisposableArrayBuffer(
  val arrayBuffer: ArrayBuffer,
  val dispose: () -> Unit,
)

private fun ByteBuffer.wrapOrCopyIntoArrayBuffer(): DisposableArrayBuffer {
  val buffer = readableBytes()
  if (buffer.isDirect) {
    val arrayBuffer = ArrayBuffer.wrap(buffer)
    return DisposableArrayBuffer(arrayBuffer) {
      // no release
    }
  }

  val directBuffer = DirectByteBufferPool.Shared.acquire(buffer.remaining())
  directBuffer.put(buffer)
  val arrayBuffer = ArrayBuffer.wrap(directBuffer)
  return DisposableArrayBuffer(arrayBuffer) {
    DirectByteBufferPool.Shared.release(directBuffer)
  }
}

fun ImageProxy.getPixelBuffer(): DisposableArrayBuffer {
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
    hardwareBuffer?.use { hardwareBuffer ->
      if (hardwareBuffer.isCpuReadablePixelBuffer) {
        // Fast Path: We have a CPU-readable HardwareBuffer.
        val arrayBuffer = ArrayBuffer.wrap(hardwareBuffer)
        return DisposableArrayBuffer(arrayBuffer) {
          // no release
        }
      }
    }
  }

  when {
    planes.size == 1 -> {
      // Medium Path: We can wrap a single direct plane as a ByteBuffer, or copy it into one if needed.
      return planes.single().buffer.wrapOrCopyIntoArrayBuffer()
    }
    planes.size > 1 -> {
      // Slow Path: We have to copy all planes into a new ByteBuffer.
      val buffers = planes.map { plane -> plane.buffer.readableBytes() }
      val totalBytes = buffers.sumOf { buffer -> buffer.remaining() }
      val byteBuffer = DirectByteBufferPool.Shared.acquire(totalBytes)
      for (buffer in buffers) {
        byteBuffer.put(buffer)
      }
      val arrayBuffer = ArrayBuffer.wrap(byteBuffer)
      return DisposableArrayBuffer(arrayBuffer) {
        DirectByteBufferPool.Shared.release(byteBuffer)
      }
    }
    else -> throw Error("ImageProxy does not contain any readable Pixel Data!")
  }
}
