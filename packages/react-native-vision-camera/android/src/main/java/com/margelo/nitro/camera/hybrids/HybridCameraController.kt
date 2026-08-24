package com.margelo.nitro.camera.hybrids

import android.animation.Animator
import android.animation.ValueAnimator
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.camera.core.Camera
import androidx.camera.core.CameraState
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.LowLightBoostState
import androidx.camera.core.MeteringPoint
import androidx.camera.core.TorchState
import com.google.common.util.concurrent.ListenableFuture
import com.margelo.nitro.camera.CameraControllerConfiguration
import com.margelo.nitro.camera.ExposureMode
import com.margelo.nitro.camera.FocusMode
import com.margelo.nitro.camera.FocusOptions
import com.margelo.nitro.camera.HybridCameraControllerSpec
import com.margelo.nitro.camera.HybridCameraDeviceSpec
import com.margelo.nitro.camera.HybridMeteringPointSpec
import com.margelo.nitro.camera.ListenerSubscription
import com.margelo.nitro.camera.MeteringMode
import com.margelo.nitro.camera.SceneAdaptiveness
import com.margelo.nitro.camera.TorchMode
import com.margelo.nitro.camera.Variant_NullType_Double
import com.margelo.nitro.camera.WhiteBalanceGains
import com.margelo.nitro.camera.WhiteBalanceMode
import com.margelo.nitro.camera.WhiteBalanceTemperatureAndTint
import com.margelo.nitro.camera.extensions.await
import com.margelo.nitro.camera.extensions.converters.fromTorchState
import com.margelo.nitro.camera.extensions.converters.toMeteringMode
import com.margelo.nitro.camera.hybrids.inputs.HybridCameraDevice
import com.margelo.nitro.camera.hybrids.metering.HybridMeteringPoint
import com.margelo.nitro.core.Promise
import com.margelo.nitro.core.resolve
import com.margelo.nitro.core.resolved
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

class HybridCameraController(
  val camera: Camera,
) : HybridCameraControllerSpec() {
  override val device: HybridCameraDeviceSpec = HybridCameraDevice(camera.cameraInfo)
  private val cameraState: CameraState?
    get() = camera.cameraInfo.cameraState.value
  private var zoomAnimator: ValueAnimator? = null
  private val focusResetHandler = Handler(Looper.getMainLooper())
  private val focusGeneration = AtomicLong()
  private val focusResetLock = Any()
  private var pendingFocusReset: Runnable? = null

  override val isConnected: Boolean
    get() = cameraState?.type == CameraState.Type.OPEN

  override val isSuspended: Boolean
    get() = cameraState?.error?.code == CameraState.ERROR_DO_NOT_DISTURB_MODE_ENABLED

  override val isUsedByAnotherApp: Boolean
    get() = cameraState?.error?.code == CameraState.ERROR_CAMERA_IN_USE

  override val zoom: Double
    get() =
      camera.cameraInfo.zoomState.value
        ?.zoomRatio
        ?.toDouble() ?: 1.0
  override val minZoom: Double
    get() =
      camera.cameraInfo.zoomState.value
        ?.minZoomRatio
        ?.toDouble() ?: 1.0
  override val maxZoom: Double
    get() =
      camera.cameraInfo.zoomState.value
        ?.maxZoomRatio
        ?.toDouble() ?: 1.0
  override val displayableZoomFactor: Double
    get() = zoom * camera.cameraInfo.intrinsicZoomRatio

  override val torchStrength: Double
    get() =
      camera.cameraInfo.torchStrengthLevel.value
        ?.toDouble() ?: 0.0

  override val torchMode: TorchMode
    get() = TorchMode.fromTorchState(camera.cameraInfo.torchState.value ?: TorchState.OFF)

  override val exposureBias: Double
    get() =
      camera.cameraInfo.exposureState.exposureCompensationIndex
        .toDouble()

  override val isLowLightBoostEnabled: Boolean
    get() = camera.cameraInfo.lowLightBoostState.value != LowLightBoostState.OFF
  override val isDistortionCorrectionEnabled: Boolean
    get() = false
  override val isSmoothAutoFocusEnabled: Boolean
    get() = false

  // TODO: CameraX only supports continuous AE/AF/AWB
  override val focusMode: FocusMode
    get() = FocusMode.CONTINUOUS_AUTO_FOCUS
  override val exposureMode: ExposureMode
    get() = ExposureMode.CONTINUOUS_AUTO_EXPOSURE
  override val whiteBalanceMode: WhiteBalanceMode
    get() = WhiteBalanceMode.CONTINUOUS_AUTO_WHITE_BALANCE

  override fun configure(config: CameraControllerConfiguration): Promise<Unit> {
    return Promise.async {
      val futures = mutableListOf<ListenableFuture<*>>()

      // `enableLowLightBoost={...}`
      if (config.enableLowLightBoost != null) {
        futures += camera.cameraControl.enableLowLightBoostAsync(config.enableLowLightBoost)
      }

      // `enableSmoothAutoFocus={...}`
      if (config.enableSmoothAutoFocus != null) {
        // TODO: Implement enableSmoothAutoFocus changing when CameraX supports it
      }
      // `enableDistortionCorrection={...}`
      if (config.enableDistortionCorrection != null) {
        // TODO: Implement enableDistortionCorrection changing when CameraX supports it
      }

      futures.forEach { it.await() }
    }
  }

  override fun setZoom(zoom: Double): Promise<Unit> {
    return Promise.async {
      val zoomState = camera.cameraInfo.zoomState.value
      val zoom = zoom.toFloat()
      if (zoomState != null) {
        if (zoom < zoomState.minZoomRatio || zoom > zoomState.maxZoomRatio) {
          throw Error(
            "`zoom` is out of range! Expected value within " +
              "${zoomState.minZoomRatio}...${zoomState.maxZoomRatio}, received $zoom.",
          )
        }
      }
      camera.cameraControl
        .setZoomRatio(zoom)
        .await()
    }
  }

  override fun focusTo(
    point: HybridMeteringPointSpec,
    options: FocusOptions,
  ): Promise<Unit> = focusTo(point, options, null)

  fun focusTo(
    point: HybridMeteringPointSpec,
    options: FocusOptions,
    onReset: (() -> Unit)?,
  ): Promise<Unit> {
    val generation = beginFocusOperation()
    return Promise.async {
      val point =
        point as? HybridMeteringPoint
          ?: throw Error("Point is not of type `HybridMeteringPoint`!")
      val meteringPoint = point.meteringPoint
      val meteringModes = options.modes ?: getAllSupportedMeteringModes(meteringPoint)
      val meteringMode = meteringModes.toMeteringMode()
      val adaptiveness = options.adaptiveness ?: SceneAdaptiveness.CONTINUOUS
      val autoResetAfter = options.autoResetAfter ?: Variant_NullType_Double.create(5.0)

      val focusAction =
        FocusMeteringAction.Builder(meteringPoint, meteringMode).also { action ->
          // Lock the focus after it completed if desired
          when (adaptiveness) {
            SceneAdaptiveness.LOCKED -> action.setLockingMode(meteringMode)
            SceneAdaptiveness.CONTINUOUS -> action.setLockingMode(0)
          }
          // Disable auto reset, or set it to a fixed duration (seconds)
          if (onReset != null) {
            action.disableAutoCancel()
          } else {
            autoResetAfter.match(
              { _ -> action.disableAutoCancel() },
              { duration -> action.setAutoCancelDuration(duration.toLong(), TimeUnit.SECONDS) },
            )
          }
        }
      camera.cameraControl
        .startFocusAndMetering(focusAction.build())
        .await()

      if (onReset != null) {
        autoResetAfter.match(
          { _ -> },
          { duration -> scheduleFocusReset(generation, duration, onReset) },
        )
      }
    }
  }

  private fun beginFocusOperation(): Long {
    val generation = focusGeneration.incrementAndGet()
    synchronized(focusResetLock) {
      pendingFocusReset?.let { focusResetHandler.removeCallbacks(it) }
      pendingFocusReset = null
    }
    return generation
  }

  private fun scheduleFocusReset(
    generation: Long,
    duration: Double,
    onReset: () -> Unit,
  ) {
    val reset =
      Runnable {
        if (focusGeneration.get() != generation) return@Runnable
        val future = camera.cameraControl.cancelFocusAndMetering()
        future.addListener(
          {
            try {
              future.get()
              if (focusGeneration.get() == generation) {
                synchronized(focusResetLock) {
                  pendingFocusReset = null
                }
                onReset()
              }
            } catch (error: Throwable) {
              Log.e(TAG, "Failed to automatically reset focus!", error)
            }
          },
          { command -> focusResetHandler.post(command) },
        )
      }
    synchronized(focusResetLock) {
      if (focusGeneration.get() == generation) {
        pendingFocusReset = reset
        focusResetHandler.postDelayed(reset, (duration * 1_000).toLong())
      }
    }
  }

  /**
   * Get a list of all [MeteringMode]s that are supported on this device.
   */
  private fun getAllSupportedMeteringModes(point: MeteringPoint): Array<MeteringMode> {
    val allModes = arrayOf(MeteringMode.AE, MeteringMode.AF, MeteringMode.AWB)
    return allModes
      .filter { mode ->
        val action = FocusMeteringAction.Builder(point, mode.toMeteringMode()).build()
        camera.cameraInfo.isFocusMeteringSupported(action)
      }.toTypedArray()
  }

  override fun resetFocus(): Promise<Unit> {
    beginFocusOperation()
    return Promise.async {
      camera.cameraControl
        .cancelFocusAndMetering()
        .await()
    }
  }

  override fun addSubjectAreaChangedListener(onSubjectAreaChanged: (() -> Unit)): ListenerSubscription {
    // TODO: CameraX does not yet support subject area changed listeners.
    //       Feature Request: https://issuetracker.google.com/issues/505643406
    return ListenerSubscription {
      // noop
    }
  }

  override fun setExposureBias(exposure: Double): Promise<Unit> {
    return Promise.async {
      camera.cameraControl
        .setExposureCompensationIndex(exposure.toInt())
        .await()
    }
  }

  override fun setTorchMode(mode: TorchMode): Promise<Unit> {
    return Promise.async {
      when (mode) {
        TorchMode.OFF -> {
          camera.cameraControl
            .enableTorch(false)
            .await()
        }
        TorchMode.ON -> {
          camera.cameraControl
            .enableTorch(true)
            .await()
        }
      }
    }
  }

  override fun enableTorchWithStrength(strength: Double): Promise<Unit> {
    return Promise.async {
      camera.cameraControl
        .setTorchStrengthLevel(strength.toInt())
        .await()
      camera.cameraControl
        .enableTorch(true)
        .await()
    }
  }

  override fun startZoomAnimation(
    zoom: Double,
    rate: Double,
  ): Promise<Unit> {
    val promise = Promise<Unit>()

    zoomAnimator?.cancel()

    val from = this.zoom.toFloat()
    val to = zoom.toFloat()
    zoomAnimator =
      ValueAnimator.ofFloat(from, to).apply {
        duration = rate.toLong()
        addUpdateListener {
          val currentZoomRatio = (animatedValue as Float)
          camera.cameraControl.setZoomRatio(currentZoomRatio)
        }
        addListener(
          object : Animator.AnimatorListener {
            override fun onAnimationCancel(p0: Animator) {
              val error = Error("The Zoom animation was canceled!")
              promise.reject(error)
            }

            override fun onAnimationEnd(animator: Animator) {
              val isCanceled = !isRunning && isStarted && animatedFraction != 1f
              if (!isCanceled) {
                promise.resolve()
              }
            }

            override fun onAnimationRepeat(animator: Animator) = Unit

            override fun onAnimationStart(animator: Animator) = Unit
          },
        )
        start()
      }

    return promise
  }

  override fun cancelZoomAnimation(): Promise<Unit> {
    zoomAnimator?.cancel()
    zoomAnimator = null
    return Promise.resolved()
  }

  // TODO: Once CameraX implements locking Focus to a custom lens position, implement this:
  override val lensPosition: Double
    get() = 0.0

  override fun setFocusLocked(lensPosition: Double): Promise<Unit> {
    throw Error(
      "Setting Focus Lens Position is not yet supported on Android! " +
        "You can use AF metering locks (`focusTo(point, { modes: ['AF'], adaptiveness: 'locked' })`) instead.",
    )
  }

  override fun lockCurrentFocus(): Promise<Unit> {
    throw Error(
      "Setting Focus Lens Position is not yet supported on Android! " +
        "You can use AF metering locks (`focusTo(point, { modes: ['AF'], adaptiveness: 'locked' })`) instead.",
    )
  }

  // TODO: Once CameraX implements locking Exposure to custom duration/ISO, implement this:
  override val minExposureDuration: Double
    get() = 0.0
  override val maxExposureDuration: Double
    get() = 0.0
  override val minISO: Double
    get() = 0.0
  override val maxISO: Double
    get() = 0.0
  override val iso: Double
    get() = 0.0
  override val exposureDuration: Double
    get() = 0.0

  override fun setExposureLocked(
    duration: Double,
    iso: Double,
  ): Promise<Unit> {
    throw Error(
      "Locking Exposure to manual duration/ISO values is not yet supported on Android! " +
        "You can use Exposure Bias (`setExposureBias(...)`) or AE metering locks (`focusTo(point, { modes: ['AE'], adaptiveness: 'locked' })`) instead.",
    )
  }

  override fun lockCurrentExposure(): Promise<Unit> {
    throw Error(
      "Locking Exposure to manual duration/ISO values is not yet supported on Android! " +
        "You can use Exposure Bias (`setExposureBias(...)`) or AE metering locks (`focusTo(point, { modes: ['AE'], adaptiveness: 'locked' })`) instead.",
    )
  }

  // TODO: Once CameraX implements locking AWB to custom White Balance Gains, implement this:
  override val whiteBalanceGains: WhiteBalanceGains
    get() = WhiteBalanceGains(0.0, 0.0, 0.0)

  override fun convertWhiteBalanceTemperatureAndTintValues(whiteBalanceTemperatureAndTint: WhiteBalanceTemperatureAndTint): WhiteBalanceGains {
    throw Error(
      "Locking White Balance Gains is not yet supported on Android! " +
        "You can use AWB metering locks (`focusTo(point, { modes: ['AWB'], adaptiveness: 'locked' })`) instead.",
    )
  }

  override fun setWhiteBalanceLocked(whiteBalanceGains: WhiteBalanceGains): Promise<Unit> {
    throw Error(
      "Locking White Balance Gains is not yet supported on Android! " +
        "You can use AWB metering locks (`focusTo(point, { modes: ['AWB'], adaptiveness: 'locked' })`) instead.",
    )
  }

  override fun lockCurrentWhiteBalance(): Promise<Unit> {
    throw Error(
      "Locking White Balance Gains is not yet supported on Android! " +
        "You can use AWB metering locks (`focusTo(point, { modes: ['AWB'], adaptiveness: 'locked' })`) instead.",
    )
  }
}
