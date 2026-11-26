package com.margelo.nitro.camera.public

import android.util.Log
import androidx.camera.core.ImageProxy
import androidx.camera.view.PreviewView
import com.margelo.nitro.camera.BuildConfig

/**
 * Optional extension point that decorates FrameOutput frame delivery and PreviewView creation
 * (e.g. to inject test images). Interceptors are only accepted in build types listed in the app's
 * package.json under "visionCamera.frameInterceptors.android" (default: debug). While nothing is
 * registered, FrameOutput and PreviewView behave as usual.
 */
interface NativeFrameInterceptor {
  /**
   * Called on a FrameOutput's executor for every camera frame. Returns the frame to deliver: [image],
   * a replacement, or null to drop it. If [image] is not returned, the interceptor must close it.
   */
  fun intercept(
    image: ImageProxy,
    isMirrored: Boolean,
  ): ImageProxy?

  /** Called on the UI thread when a PreviewView is created. */
  fun onPreviewViewCreated(view: PreviewView)
}

object FrameInterceptors {
  private const val TAG = "FrameInterceptors"

  /** Whether this build of VisionCamera accepts an interceptor (decided at compile time). */
  val isEnabled: Boolean
    get() = BuildConfig.FRAME_INTERCEPTORS

  @Volatile
  private var registered: NativeFrameInterceptor? = null

  /**
   * Registers [interceptor]. Only one interceptor can be registered, and only if [isEnabled];
   * otherwise the call is refused, logged and returns `false`.
   */
  @Synchronized
  fun register(interceptor: NativeFrameInterceptor): Boolean {
    val name = interceptor.javaClass.name
    if (!isEnabled) {
      Log.e(TAG, "Frame interceptors are disabled in this build; ignoring $name.")
      return false
    }
    registered?.let {
      Log.e(TAG, "Frame interceptor ${it.javaClass.name} is already registered; ignoring $name.")
      return false
    }
    registered = interceptor
    Log.w(TAG, "Frame interceptor $name registered: camera frames and previews can be replaced in this build.")
    return true
  }

  internal fun intercept(
    image: ImageProxy,
    isMirrored: Boolean,
  ): ImageProxy? {
    val interceptor = registered ?: return image
    return try {
      interceptor.intercept(image, isMirrored)
    } catch (e: Throwable) {
      Log.e(TAG, "Frame interceptor failed; delivering the camera frame.", e)
      image
    }
  }

  internal fun previewCreated(view: PreviewView) {
    try {
      registered?.onPreviewViewCreated(view)
    } catch (e: Throwable) {
      Log.e(TAG, "Frame interceptor failed to decorate a PreviewView.", e)
    }
  }
}
