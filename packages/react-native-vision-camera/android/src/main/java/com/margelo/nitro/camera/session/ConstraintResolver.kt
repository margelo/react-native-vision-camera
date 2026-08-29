package com.margelo.nitro.camera.session

import android.util.Log
import android.util.Range
import androidx.camera.core.CameraInfo
import androidx.camera.core.ImageCapture
import androidx.camera.core.Preview
import androidx.camera.core.SessionConfig
import androidx.camera.video.Recorder
import com.margelo.nitro.camera.CameraOutputConfiguration
import com.margelo.nitro.camera.Constraint
import com.margelo.nitro.camera.FPSConstraint
import com.margelo.nitro.camera.PhotoHDRConstraint
import com.margelo.nitro.camera.PreviewStabilizationModeConstraint
import com.margelo.nitro.camera.TargetColorSpace
import com.margelo.nitro.camera.TargetDynamicRange
import com.margelo.nitro.camera.TargetDynamicRangeBitDepth
import com.margelo.nitro.camera.TargetStabilizationMode
import com.margelo.nitro.camera.VideoDynamicRangeConstraint
import com.margelo.nitro.camera.VideoStabilizationModeConstraint
import com.margelo.nitro.camera.extensions.converters.toDynamicRange
import com.margelo.nitro.camera.public.NativeCameraOutput
import kotlin.math.abs

object ConstraintResolver {
  private const val TAG = "ConstraintResolver"

  /**
   * Resolves the given [constraints] into a [CameraSessionConfig] that [cameraInfo] supports.
   *
   * Constraints are ordered by priority (highest first, lowest last).
   * First-of-type wins — if duplicate constraint types exist, only the
   * highest-priority one is used.
   *
   * The resolver works in two passes:
   * 1. **Feature pass**: Progressively downgrades non-FPS constraints (stabilization, HDR, etc.)
   *    until [isSessionConfigSupported] accepts the use-case combination.
   * 2. **FPS pass**: Queries [CameraInfo.getSupportedFrameRateRanges] for the validated SessionConfig
   *    to get the *actually* supported FPS ranges for this use-case combo, then picks
   *    the best match for the user's FPS target.
   *
   * This two-pass approach is necessary because the supported FPS ranges depend on
   * which use-cases and features are active — a range valid at SDR may not be valid at HDR.
   */
  fun resolveConstraints(
    cameraInfo: CameraInfo,
    outputConfigurations: Array<CameraOutputConfiguration>,
    constraints: Array<Constraint>,
  ): CameraSessionConfig {
    // Separate FPS from other constraints — FPS is resolved after features.
    val fpsConstraint = constraints.firstNotNullOfOrNull { it.asType<FPSConstraint>() }
    val activeConstraints =
      constraints
        .filter { !it.isType<FPSConstraint>() }
        .filter { it.isSupportedIndividually(cameraInfo) }
        .toMutableList()

    // Pass 1: Resolve features (stab, HDR, etc.) via isSessionConfigSupported.
    // SessionConfig is built WITHOUT FPS — FPS ranges depend on the resolved features.
    while (true) {
      val config = activeConstraints.toConfig(cameraInfo)
      val preparedUseCases =
        outputConfigurations.map { outputConfiguration ->
          val output =
            outputConfiguration.output as? NativeCameraOutput
              ?: throw Error("The given `output` (${outputConfiguration.output}) is not of type `NativeCameraOutput`!")
          return@map output.createUseCase(outputConfiguration.mirrorMode, config)
        }
      val sessionConfig =
        SessionConfig
          .Builder(preparedUseCases.map { it.useCase })
          .build()

      if (cameraInfo.isSessionConfigSupported(sessionConfig) || activeConstraints.isEmpty()) {
        // Pass 2: Resolve FPS against the validated use-case combination.
        val resolvedFPSRange = fpsConstraint?.resolveFPSRange(cameraInfo, sessionConfig)
        val finalConfig = config.copy(fpsRange = resolvedFPSRange)
        val finalSessionConfig =
          if (resolvedFPSRange != null) {
            SessionConfig
              .Builder(preparedUseCases.map { it.useCase })
              .apply { setFrameRateRange(resolvedFPSRange) }
              .build()
          } else {
            sessionConfig
          }
        Log.i(TAG, "Resolved constraints to: $finalConfig")
        return CameraSessionConfig(finalSessionConfig, preparedUseCases, finalConfig)
      }

      // Downgrade the lowest-priority (last) constraint
      val lastIndex = activeConstraints.lastIndex
      val downgraded = activeConstraints[lastIndex].getNextBestOption()
      if (downgraded != null) {
        Log.i(TAG, "Downgrading ${activeConstraints[lastIndex]} to $downgraded")
        activeConstraints[lastIndex] = downgraded
      } else {
        Log.i(TAG, "Dropping ${activeConstraints[lastIndex]}")
        activeConstraints.removeAt(lastIndex)
      }
    }
  }

  /**
   * Resolves the FPS constraint against the actually-supported ranges for this
   * use-case combination. Uses [CameraInfo.getSupportedFrameRateRanges] which
   * returns ranges that are valid for the specific [sessionConfig].
   *
   * Picks the supported range whose upper bound is closest to the target FPS.
   * On ties, prefers tighter ranges (higher lower bound).
   */
  private fun FPSConstraint.resolveFPSRange(
    cameraInfo: CameraInfo,
    sessionConfig: SessionConfig,
  ): Range<Int>? {
    val targetFps = fps.toInt()
    val supportedRanges = cameraInfo.getSupportedFrameRateRanges(sessionConfig)
    if (supportedRanges.isEmpty()) return null

    return supportedRanges.minWith(
      compareBy<Range<Int>> {
        // Primary: closest upper bound to target
        abs(it.upper - targetFps)
      }.thenByDescending {
        // Tiebreaker: prefer tighter range (higher lower bound)
        it.lower
      },
    )
  }
}

// MARK: - Config Resolution

/**
 * Resolves all [Constraint]s into a [NativeCameraOutput.Config].
 *
 * First-of-type wins (= highest priority). Fields not covered by any
 * constraint are `null`, meaning "platform decides".
 *
 * FPS is not resolved here — it requires a validated [SessionConfig]
 * and is resolved separately in [FPSConstraint.resolveFPSRange].
 */
internal fun List<Constraint>.toConfig(cameraInfo: CameraInfo? = null): NativeCameraOutput.Config {
  return NativeCameraOutput.Config(
    fpsRange = null, // resolved after feature validation
    previewStabilizationMode = firstNotNullOfOrNull { it.asType<PreviewStabilizationModeConstraint>() }?.previewStabilizationMode,
    videoStabilizationMode = firstNotNullOfOrNull { it.asType<VideoStabilizationModeConstraint>() }?.videoStabilizationMode,
    videoDynamicRange = firstNotNullOfOrNull { it.asType<VideoDynamicRangeConstraint>() }?.videoDynamicRange,
    photoHDR = firstNotNullOfOrNull { it.asType<PhotoHDRConstraint>() }?.photoHDR,
    cameraInfo = cameraInfo,
  )
}

// MARK: - Individual Support Check

/**
 * Checks whether this [Constraint] can possibly be honored on [cameraInfo].
 *
 * Used as an up-front filter to drop constraints that cannot work on this
 * device at all, before the downgrade loop runs.
 *
 * When in doubt, returns `true` — a constraint that wrongly returns `false`
 * is silently dropped with no chance of recovery.
 */
private fun Constraint.isSupportedIndividually(cameraInfo: CameraInfo): Boolean {
  return this.match(
    { true }, // FPS: resolved separately after features
    { videoStabilizationMode ->
      when (videoStabilizationMode.videoStabilizationMode) {
        TargetStabilizationMode.OFF -> true
        TargetStabilizationMode.AUTO -> true
        else -> Recorder.getVideoCapabilities(cameraInfo).isStabilizationSupported
      }
    },
    { previewStabilizationMode ->
      when (previewStabilizationMode.previewStabilizationMode) {
        TargetStabilizationMode.OFF -> true
        TargetStabilizationMode.AUTO -> true
        else -> Preview.getPreviewCapabilities(cameraInfo).isStabilizationSupported
      }
    },
    { true }, // Resolution: CameraX handles this internally
    { videoDynamicRange ->
      val dynamicRange = videoDynamicRange.videoDynamicRange.toDynamicRange()
      Recorder.getVideoCapabilities(cameraInfo).supportedDynamicRanges.contains(dynamicRange)
    },
    { photoHDR ->
      if (photoHDR.photoHDR) {
        ImageCapture
          .getImageCaptureCapabilities(cameraInfo)
          .supportedOutputFormats
          .contains(ImageCapture.OUTPUT_FORMAT_JPEG_ULTRA_HDR)
      } else {
        true
      }
    },
    { true }, // PixelFormat: let downgrade loop handle it
    { true }, // Binning: not configurable in CameraX
  )
}

// MARK: - Downgrade Chains

private fun TargetStabilizationMode.getNextBestMode(): TargetStabilizationMode? {
  return when (this) {
    TargetStabilizationMode.OFF -> null
    TargetStabilizationMode.AUTO -> TargetStabilizationMode.OFF
    // CameraX only knows ON/OFF — all specific modes downgrade to AUTO first.
    TargetStabilizationMode.STANDARD,
    TargetStabilizationMode.CINEMATIC,
    TargetStabilizationMode.CINEMATIC_EXTENDED,
    TargetStabilizationMode.PREVIEW_OPTIMIZED,
    TargetStabilizationMode.CINEMATIC_EXTENDED_ENHANCED,
    TargetStabilizationMode.LOW_LATENCY,
    -> TargetStabilizationMode.AUTO
  }
}

private fun TargetDynamicRange.getNextBestDynamicRange(): TargetDynamicRange? {
  when (colorSpace) {
    TargetColorSpace.SRGB, TargetColorSpace.P3_D65 -> { /* already SDR color-space */ }
    TargetColorSpace.HLG_BT2020 ->
      return TargetDynamicRange(bitDepth, TargetColorSpace.SRGB, colorRange)
    TargetColorSpace.DOLBY_VISION ->
      return TargetDynamicRange(bitDepth, TargetColorSpace.HLG_BT2020, colorRange)
    TargetColorSpace.APPLE_LOG, TargetColorSpace.APPLE_LOG_2 ->
      return TargetDynamicRange(bitDepth, TargetColorSpace.SRGB, colorRange)
  }
  when (bitDepth) {
    TargetDynamicRangeBitDepth.SDR_8_BIT -> { /* already lowest */ }
    TargetDynamicRangeBitDepth.HDR_10_BIT ->
      return TargetDynamicRange(TargetDynamicRangeBitDepth.SDR_8_BIT, TargetColorSpace.SRGB, colorRange)
  }
  return null
}

/**
 * Returns the next-best downgraded version of this [Constraint],
 * or `null` if it cannot be lowered further (caller should drop it).
 *
 * FPS is not in the downgrade loop — it is resolved separately after features.
 */
private fun Constraint.getNextBestOption(): Constraint? {
  return this.match(
    { null }, // FPS: resolved separately, never in the downgrade loop
    { videoStabilizationMode ->
      videoStabilizationMode.videoStabilizationMode
        .getNextBestMode()
        ?.let { Constraint.create(VideoStabilizationModeConstraint(it)) }
    },
    { previewStabilizationMode ->
      previewStabilizationMode.previewStabilizationMode
        .getNextBestMode()
        ?.let { Constraint.create(PreviewStabilizationModeConstraint(it)) }
    },
    { null }, // Resolution: not factored into constraint resolver
    { dynamicRange ->
      dynamicRange.videoDynamicRange
        .getNextBestDynamicRange()
        ?.let { Constraint.create(VideoDynamicRangeConstraint(it)) }
    },
    { null }, // PhotoHDR: on or off, no middle ground
    { null }, // PixelFormat: no fallback
    { null }, // Binning: not configurable
  )
}
