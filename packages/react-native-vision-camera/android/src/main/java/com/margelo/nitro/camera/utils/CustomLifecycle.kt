package com.margelo.nitro.camera.utils

import android.util.Log
import androidx.annotation.UiThread
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.common.LifecycleState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * A [LifecycleOwner] that binds to the [context]'s lifecycle and has an additional
 * [isActive] property that pauses or resumes whatever the [context]'s lifecycle is.
 */
class CustomLifecycle(
  private val context: ReactApplicationContext,
  initialIsActive: Boolean,
) : LifecycleEventListener,
  LifecycleOwner {
  companion object {
    private const val TAG = "CustomLifecycle"
  }

  private val lifecycleRegistry = LifecycleRegistry(this)
  private val uiScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

  @Volatile private var isActive: Boolean = initialIsActive

  @Volatile private var isDestroyed = false

  override val lifecycle: Lifecycle
    get() = lifecycleRegistry

  init {
    context.addLifecycleEventListener(this)
    uiScope.launch {
      updateLifecycle()
    }
  }

  suspend fun setActive(active: Boolean) {
    isActive = active
    withContext(Dispatchers.Main.immediate) {
      updateLifecycle()
    }
  }

  @UiThread
  fun destroy() {
    isDestroyed = true
    context.removeLifecycleEventListener(this)
    moveTo(Lifecycle.State.DESTROYED)
  }

  @UiThread
  override fun onHostResume() {
    updateLifecycle()
  }

  @UiThread
  override fun onHostPause() {
    updateLifecycle()
  }

  @UiThread
  override fun onHostDestroy() {
    destroy()
  }

  @UiThread
  private fun updateLifecycle() {
    if (isDestroyed) return
    val newState =
      when (context.lifecycleState) {
        LifecycleState.BEFORE_CREATE -> Lifecycle.State.CREATED
        LifecycleState.BEFORE_RESUME -> if (isActive) Lifecycle.State.STARTED else Lifecycle.State.CREATED
        LifecycleState.RESUMED -> if (isActive) Lifecycle.State.RESUMED else Lifecycle.State.CREATED
      }
    moveTo(newState)
  }

  @UiThread
  private fun moveTo(state: Lifecycle.State) {
    val current = lifecycleRegistry.currentState
    if (current == state) return
    Log.i(TAG, "Switching lifecycle state from $current to $state...")

    // Move monotonically with events
    when {
      state > current -> {
        if (current < Lifecycle.State.CREATED) lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_CREATE)
        if (state >= Lifecycle.State.STARTED &&
          current < Lifecycle.State.STARTED
        ) {
          lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_START)
        }
        if (state >= Lifecycle.State.RESUMED &&
          current < Lifecycle.State.RESUMED
        ) {
          lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_RESUME)
        }
      }
      else -> {
        if (current >= Lifecycle.State.RESUMED &&
          state < Lifecycle.State.RESUMED
        ) {
          lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_PAUSE)
        }
        if (current >= Lifecycle.State.STARTED &&
          state < Lifecycle.State.STARTED
        ) {
          lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_STOP)
        }
        if (current >= Lifecycle.State.CREATED &&
          state < Lifecycle.State.CREATED
        ) {
          lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_DESTROY)
        }
      }
    }
  }
}
