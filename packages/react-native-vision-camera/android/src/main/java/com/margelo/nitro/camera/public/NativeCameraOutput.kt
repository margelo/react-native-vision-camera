package com.margelo.nitro.camera.public

import android.util.Range
import androidx.camera.core.CameraInfo
import androidx.camera.core.UseCase
import com.margelo.nitro.camera.MirrorMode
import com.margelo.nitro.camera.TargetDynamicRange
import com.margelo.nitro.camera.TargetStabilizationMode

interface NativeCameraOutput {
  /**
   * Resolved configuration for a camera output.
   * `null` values mean "no constraint specified, platform decides".
   */
  data class Config(
    val fpsRange: Range<Int>?,
    val previewStabilizationMode: TargetStabilizationMode?,
    val videoStabilizationMode: TargetStabilizationMode?,
    val videoDynamicRange: TargetDynamicRange?,
    val photoHDR: Boolean?,
    val cameraInfo: CameraInfo? = null,
  )

  /**
   * A [UseCase] that has been prepared by a [NativeCameraOutput],
   * but not yet attached to the Camera.
   *
   * The output captures its own typed reference (e.g. [androidx.camera.core.ImageCapture],
   * [androidx.camera.core.Preview]) inside the [onAttached] closure at creation time,
   * so no downcasting is ever needed.
   *
   * After the [UseCase] has been bound to the Camera via
   * `bindToLifecycle(...)`, call [notifyAttached] to let the
   * output know it can start using the live [UseCase].
   */
  class PreparedUseCase(
    val useCase: UseCase,
    private val onAttached: () -> Unit,
  ) {
    /** Notify the output that this [UseCase] has been attached to the Camera. */
    fun notifyAttached() = onAttached()
  }

  /**
   * Get the currently selected [MirrorMode].
   */
  val mirrorMode: MirrorMode

  /**
   * Creates a [PreparedUseCase] for the given [Config].
   *
   * This may be called multiple times for probing feature
   * compatibility (e.g. in [ConstraintResolver]).
   * Only the final winning [PreparedUseCase] will have
   * [PreparedUseCase.notifyAttached] called on it.
   *
   * You may re-use a previously created [UseCase]
   * if the given [config] is the same for your
   * [UseCase], which could result in better
   * performance and session start times with large
   * allocations.
   */
  fun createUseCase(
    mirrorMode: MirrorMode,
    config: Config,
  ): PreparedUseCase
}
