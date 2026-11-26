package com.margelo.nitro.camera.hybrids

import android.annotation.SuppressLint
import android.util.Log
import androidx.annotation.UiThread
import androidx.camera.core.Camera
import androidx.camera.core.ConcurrentCamera
import androidx.camera.core.UseCaseGroup
import androidx.camera.lifecycle.ProcessCameraProvider
import com.facebook.react.bridge.ReactApplicationContext
import com.margelo.nitro.NitroModules
import com.margelo.nitro.camera.CameraSessionConfiguration
import com.margelo.nitro.camera.CameraSessionConnection
import com.margelo.nitro.camera.Constraint
import com.margelo.nitro.camera.HybridCameraControllerSpec
import com.margelo.nitro.camera.HybridCameraSessionSpec
import com.margelo.nitro.camera.InterruptionReason
import com.margelo.nitro.camera.ListenerSubscription
import com.margelo.nitro.camera.extensions.getCameraInfo
import com.margelo.nitro.camera.extensions.mapToArray
import com.margelo.nitro.camera.public.NativeCameraOutput
import com.margelo.nitro.camera.session.ActiveCameraSession
import com.margelo.nitro.camera.session.ActiveCameraSessionMulti
import com.margelo.nitro.camera.session.ActiveCameraSessionSingle
import com.margelo.nitro.camera.session.ConstraintResolver
import com.margelo.nitro.camera.session.toConfig
import com.margelo.nitro.camera.utils.CustomLifecycle
import com.margelo.nitro.camera.utils.DirectByteBufferPool
import com.margelo.nitro.core.Promise
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers

@Suppress("unused")
class HybridCameraSession(
  val cameraProvider: ProcessCameraProvider,
) : HybridCameraSessionSpec(),
  ActiveCameraSession.LifecycleListener {
  private val context: ReactApplicationContext
    get() = NitroModules.applicationContext ?: throw Error("No Context!")
  private val lifecycleOwner = CustomLifecycle(context)
  private val uiScope = CoroutineScope(Dispatchers.Main)

  override val isRunning: Boolean
    get() = activeSession?.isRunning ?: false

  private var activeSession: ActiveCameraSession? = null
  private var onStartedListeners = arrayListOf<() -> Unit>()
  private var onStoppedListeners = arrayListOf<() -> Unit>()
  private var onErrorListeners = arrayListOf<(Throwable) -> Unit>()
  private var onInterruptionStartedListeners = arrayListOf<(InterruptionReason) -> Unit>()
  private var onInterruptionEndedListeners = arrayListOf<() -> Unit>()

  @SuppressLint("RestrictedApi")
  override fun configure(
    connections: Array<CameraSessionConnection>,
    config: CameraSessionConfiguration?,
  ): Promise<Array<HybridCameraControllerSpec>> {
    return Promise.async(uiScope) {
      Log.i(TAG, "Reconfiguring CameraSession with ${connections.size} connection(s)...")

      // TODO: Cache previous UseCases and deep-compare their equality - if nothing was re-created after our configure we
      //       could avoid unbindAll() + bindToLifecycle() calls.
      //       I think SessionConfig can be rebound directly for faster switches?

      // 1. Unbind all inputs/outputs
      cameraProvider.unbindAll()
      activeSession?.close()
      activeSession = null

      // 2. Build up Camera depending on connections count
      when (connections.size) {
        0 -> {
          // No Cameras - done :)
          return@async emptyArray()
        }
        1 -> {
          // Single Camera Session
          val connection = connections.single()
          val cameraInfo = connection.getCameraInfo(cameraProvider)
          val outputConfigurations = connection.outputs
          val config = ConstraintResolver.resolveConstraints(cameraInfo, outputConfigurations, connection.constraints)
          Log.i(TAG, "Binding use-cases: ${config.sessionConfig.useCases}")

          if (connection.onSessionConfigSelected != null) {
            // Notify JS callback that we resolved the constraints to a specific `config`
            val hybridConfig = HybridCameraSessionConfig(config.sessionConfig, config.resolvedConfig)
            connection.onSessionConfigSelected(hybridConfig)
          }

          val camera = cameraProvider.bindToLifecycle(lifecycleOwner, cameraInfo.cameraSelector, config.sessionConfig)
          // Notify outputs that their use-cases are now attached to the Camera
          config.preparedUseCases.forEach { it.notifyAttached() }
          activeSession = ActiveCameraSessionSingle(camera, this)
          applyInitialConfig(camera, connection.initialZoom, connection.initialExposureBias)
          val controller = HybridCameraController(camera)
          return@async arrayOf(controller)
        }
        else -> {
          // Multi Camera Session
          // TODO: In Multi-Cam we cannot use the CameraX `SessionConfig` API, so we cannot use `ConstraintsResolver`!
          //       This effectively means that no special features (FPS, HDR, Stabilization, ...) are supported in multi-cam... :(
          //       Implement this once CameraX supports it - feature request: https://issuetracker.google.com/issues/470629644
          val allPreparedUseCases = mutableListOf<NativeCameraOutput.PreparedUseCase>()
          val configs =
            connections.map { connection ->
              val cameraInfo = connection.getCameraInfo(cameraProvider)
              val outputs =
                connection.outputs.map {
                  it.output as? NativeCameraOutput
                    ?: throw Error("Output ${it.output} is not of type `NativeCameraOutput`!")
                }
              val outputConfig = emptyList<Constraint>().toConfig(cameraInfo)
              val preparedUseCases = outputs.map { it.createUseCase(it.mirrorMode, outputConfig) }
              allPreparedUseCases.addAll(preparedUseCases)
              val useCaseGroup = UseCaseGroup.Builder()
              preparedUseCases.forEach { useCaseGroup.addUseCase(it.useCase) }
              ConcurrentCamera.SingleCameraConfig(
                cameraInfo.cameraSelector,
                useCaseGroup.build(),
                lifecycleOwner,
              )
            }
          Log.i(TAG, "Binding configs: ${configs.joinToString { it.useCaseGroup.useCases.joinToString { it.name } }}")
          val concurrentCamera = cameraProvider.bindToLifecycle(configs)
          // Notify all outputs that their use-cases are now attached to the Camera
          allPreparedUseCases.forEach { it.notifyAttached() }
          activeSession = ActiveCameraSessionMulti(concurrentCamera, this)
          concurrentCamera.cameras.forEachIndexed { i, camera ->
            val connection = connections[i]
            applyInitialConfig(camera, connection.initialZoom, connection.initialExposureBias)
          }
          return@async concurrentCamera.cameras.mapToArray { HybridCameraController(it) }
        }
      }
    }
  }

  override fun start(): Promise<Unit> {
    return Promise.async(uiScope) {
      lifecycleOwner.setActive(true)
    }
  }

  override fun stop(): Promise<Unit> {
    return Promise.async(uiScope) {
      lifecycleOwner.setActive(false)
    }
  }

  override fun dispose() {
    super.dispose()
    Log.i(TAG, "Destroying CameraSession...")
    Promise.async(uiScope) {
      lifecycleOwner.destroy()
      activeSession?.close()
      cameraProvider.unbindAll()
    }
    DirectByteBufferPool.Shared.clear()
  }

  @UiThread
  private fun applyInitialConfig(
    camera: Camera,
    initialZoom: Double?,
    initialExposureBias: Double?,
  ) {
    if (initialZoom != null) {
      camera.cameraControl.setZoomRatio(initialZoom.toFloat())
    }
    if (initialExposureBias != null) {
      camera.cameraControl.setExposureCompensationIndex(initialExposureBias.toInt())
    }
  }

  // pragma MARK: Lifecycle Changed Callbacks

  override fun onStarted() {
    onStartedListeners.forEach { listener -> listener() }
  }

  override fun onStopped() {
    onStoppedListeners.forEach { listener -> listener() }
  }

  override fun onError(error: Throwable) {
    onErrorListeners.forEach { listener -> listener(error) }
  }

  override fun onInterruptionStarted() {
    onInterruptionStartedListeners.forEach { listener -> listener(InterruptionReason.UNKNOWN) }
  }

  override fun onInterruptionEnded() {
    onInterruptionEndedListeners.forEach { listener -> listener() }
  }

  // pragma MARK: Adding Listeners

  override fun addOnStartedListener(onStarted: () -> Unit): ListenerSubscription {
    onStartedListeners.add(onStarted)
    return ListenerSubscription {
      onStartedListeners.remove(onStarted)
    }
  }

  override fun addOnStoppedListener(onStopped: () -> Unit): ListenerSubscription {
    onStoppedListeners.add(onStopped)
    return ListenerSubscription {
      onStoppedListeners.remove(onStopped)
    }
  }

  override fun addOnErrorListener(onError: (Throwable) -> Unit): ListenerSubscription {
    onErrorListeners.add(onError)
    return ListenerSubscription {
      onErrorListeners.remove(onError)
    }
  }

  override fun addOnInterruptionStartedListener(onInterruptionStarted: (InterruptionReason) -> Unit): ListenerSubscription {
    onInterruptionStartedListeners.add(onInterruptionStarted)
    return ListenerSubscription {
      onInterruptionStartedListeners.remove(onInterruptionStarted)
    }
  }

  override fun addOnInterruptionEndedListener(onInterruptionEnded: () -> Unit): ListenerSubscription {
    onInterruptionEndedListeners.add(onInterruptionEnded)
    return ListenerSubscription {
      onInterruptionEndedListeners.remove(onInterruptionEnded)
    }
  }
}
