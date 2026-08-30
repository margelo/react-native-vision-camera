package com.margelo.nitro.camera.hybrids.outputs

import android.media.MediaActionSound
import android.os.SystemClock
import android.util.Log
import androidx.camera.core.CameraInfo
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.takePicture
import com.margelo.nitro.camera.CameraOrientation
import com.margelo.nitro.camera.CapturePhotoCallbacks
import com.margelo.nitro.camera.CapturePhotoSettings
import com.margelo.nitro.camera.HybridCameraPhotoOutputSpec
import com.margelo.nitro.camera.HybridPhotoSpec
import com.margelo.nitro.camera.MediaType
import com.margelo.nitro.camera.MirrorMode
import com.margelo.nitro.camera.PhotoFile
import com.margelo.nitro.camera.PhotoOutputOptions
import com.margelo.nitro.camera.QualityPrioritization
import com.margelo.nitro.camera.Size
import com.margelo.nitro.camera.extensions.converters.fromFile
import com.margelo.nitro.camera.extensions.converters.toCaptureMode
import com.margelo.nitro.camera.extensions.converters.toFlashMode
import com.margelo.nitro.camera.extensions.converters.toOutputFormat
import com.margelo.nitro.camera.extensions.converters.toResolutionSelector
import com.margelo.nitro.camera.extensions.converters.toSize
import com.margelo.nitro.camera.extensions.fileExtension
import com.margelo.nitro.camera.extensions.fromSurfaceRotation
import com.margelo.nitro.camera.extensions.sortedByClosestTo
import com.margelo.nitro.camera.extensions.surfaceRotation
import com.margelo.nitro.camera.hybrids.instances.HybridPhoto
import com.margelo.nitro.camera.public.NativeCameraOutput
import com.margelo.nitro.camera.public.NativeLocation
import com.margelo.nitro.core.Promise
import com.margelo.nitro.core.resolved
import com.margelo.nitro.image.HybridImage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File
import kotlin.math.roundToInt

class HybridPhotoOutput(
  private val options: PhotoOutputOptions,
) : HybridCameraPhotoOutputSpec(),
  NativeCameraOutput {
  override val mediaType: MediaType = MediaType.VIDEO
  override var outputOrientation: CameraOrientation = CameraOrientation.UP
    set(value) {
      field = value
      imageCapture?.targetRotation = value.surfaceRotation
    }
  override val currentResolution: Size?
    get() = imageCapture?.resolutionInfo?.resolution?.toSize()

  private val coroutineScope = CoroutineScope(Dispatchers.Default)
  private var imageCapture: ImageCapture? = null
  private val shutterSound = MediaActionSound()
  override var mirrorMode: MirrorMode = MirrorMode.AUTO

  init {
    // pre-load the shutter sound
    coroutineScope.launch {
      shutterSound.load(MediaActionSound.SHUTTER_CLICK)
    }
  }

  private fun isProcessedFormat(format: @ImageCapture.OutputFormat Int): Boolean {
    return when (format) {
      ImageCapture.OUTPUT_FORMAT_JPEG, ImageCapture.OUTPUT_FORMAT_JPEG_ULTRA_HDR -> true
      else -> false
    }
  }

  override fun createUseCase(
    mirrorMode: MirrorMode,
    config: NativeCameraOutput.Config,
  ): NativeCameraOutput.PreparedUseCase {
    val resolutionMode =
      when (options.qualityPrioritization) {
        QualityPrioritization.QUALITY -> ResolutionSelector.PREFER_HIGHER_RESOLUTION_OVER_CAPTURE_RATE
        else -> ResolutionSelector.PREFER_CAPTURE_RATE_OVER_HIGHER_RESOLUTION
      }
    val resolutionSelector =
      ResolutionSelector
        .Builder()
        .apply {
          setResolutionFilter { sizes, _ ->
            val targetSize = options.targetResolution.toSize()
            return@setResolutionFilter sizes.sortedByClosestTo(targetSize)
          }
          setAllowedResolutionMode(resolutionMode)
        }.build()

    val imageCapture =
      ImageCapture
        .Builder()
        .apply {
          // Resolution
          setResolutionSelector(resolutionSelector)

          // CameraOrientation
          setTargetRotation(outputOrientation.surfaceRotation)

          // Format (JPEG, RAW, ...)
          val allowHDR = config.photoHDR ?: false
          val outputFormat = options.containerFormat.toOutputFormat(allowHDR)
          setOutputFormat(outputFormat)

          // Capture Mode (Quality, Speed, ...)
          val captureMode = options.qualityPrioritization.toCaptureMode()
          setCaptureMode(captureMode)

          if (options.previewImageTargetSize != null) {
            setPostviewEnabled(true)
            setPostviewResolutionSelector(options.previewImageTargetSize.toResolutionSelector())
          }

          if (isProcessedFormat(outputFormat)) {
            require(options.quality in 0.0..1.0) {
              "Photo `quality` is not within 0.0 to 1.0 range! (Received: ${options.quality})"
            }
            val quality = (options.quality * 100.0).roundToInt().coerceAtLeast(1)
            setJpegQuality(quality)
          }
        }.build()

    return NativeCameraOutput.PreparedUseCase(imageCapture) {
      this.imageCapture = imageCapture
      this.mirrorMode = mirrorMode
    }
  }

  // TODO: Can we support depth delivery for photos on Android?
  override val supportsDepthDataDelivery: Boolean
    get() = false

  // TODO: Can we support Camera Calibration Data Delivery on Android?
  override val supportsCameraCalibrationDataDelivery: Boolean
    get() = false

  private fun shouldMirror(): Boolean {
    val camera = imageCapture?.camera ?: return false
    return when (mirrorMode) {
      MirrorMode.ON -> true
      MirrorMode.OFF -> false
      // AUTO follows CameraX's default "mirror front only" semantics.
      MirrorMode.AUTO -> camera.cameraInfo.lensFacing == CameraSelector.LENS_FACING_FRONT
    }
  }

  override fun capturePhoto(
    settings: CapturePhotoSettings,
    callbacks: CapturePhotoCallbacks,
  ): Promise<HybridPhotoSpec> {
    return Promise.async {
      val imageCapture =
        imageCapture
          ?: throw Error("Photo Output is not yet attached to the CameraSession!")

      Log.i(TAG, "Capturing Photo in-memory...")

      // 1. Get settings
      val isMirrored = shouldMirror()
      val enableShutterSound = (settings.enableShutterSound ?: true) || CameraInfo.mustPlayShutterSound()
      imageCapture.flashMode = settings.flashMode?.toFlashMode() ?: ImageCapture.FLASH_MODE_OFF
      val location =
        if (settings.location != null) {
          val nativeLocation = settings.location as? NativeLocation ?: throw Error("Location is not of type `NativeLocation`!")
          nativeLocation.location
        } else {
          null
        }

      // 2. Perform Capture
      var didFireOnDidCapturePhoto = false
      val image =
        imageCapture.takePicture(
          {
            callbacks.onWillBeginCapture?.invoke()
            if (enableShutterSound) {
              shutterSound.play(MediaActionSound.SHUTTER_CLICK)
            }
            // CameraX exposes a single pre-capture hook, so we fire both the
            // "will begin" and "will capture" callbacks here. On iOS these
            // are distinct moments (AVCapturePhotoCaptureDelegate).
            callbacks.onWillCapturePhoto?.invoke()
          },
          { progress ->
            if (progress == 100) {
              // Capture is complete! Now we're encoding...
              callbacks.onDidCapturePhoto?.invoke()
              didFireOnDidCapturePhoto = true
            }
          },
          { bitmap ->
            // Preview Image delivered!
            callbacks.onPreviewImageAvailable?.let { onPreviewImageAvailable ->
              val image = HybridImage(bitmap)
              onPreviewImageAvailable(image)
            }
          },
        )

      if (!didFireOnDidCapturePhoto) {
        // Not every device supports progress callbacks, so we just fire it later here
        callbacks.onDidCapturePhoto?.invoke()
      }

      // 3. Return
      return@async HybridPhoto(
        image,
        isMirrored,
        location,
      )
    }
  }

  override fun capturePhotoToFile(
    settings: CapturePhotoSettings,
    callbacks: CapturePhotoCallbacks,
  ): Promise<PhotoFile> {
    return Promise.async {
      val imageCapture =
        imageCapture
          ?: throw Error("Photo Output is not yet attached to the CameraSession!")

      Log.i(TAG, "Capturing Photo to file...")

      // 1. Get settings
      val isMirrored = shouldMirror()
      val enableShutterSound =
        (settings.enableShutterSound ?: true) || CameraInfo.mustPlayShutterSound()
      imageCapture.flashMode = settings.flashMode?.toFlashMode() ?: ImageCapture.FLASH_MODE_OFF
      val location =
        if (settings.location != null) {
          val nativeLocation =
            settings.location as? NativeLocation
              ?: throw Error("Location is not of type `NativeLocation`!")
          nativeLocation.location
        } else {
          null
        }

      val file = File.createTempFile("VisionCamera_", options.containerFormat.fileExtension)
      val metadata =
        ImageCapture.Metadata().apply {
          this.location = location
          this.isReversedHorizontal = isMirrored
        }
      val outputFileOptions =
        ImageCapture.OutputFileOptions
          .Builder(file)
          .apply {
            this.setMetadata(metadata)
          }.build()

      // 2. Perform Capture
      var didFireOnDidCapturePhoto = false
      var timestamp: Double? = null
      val result =
        imageCapture.takePicture(
          outputFileOptions,
          {
            timestamp = SystemClock.elapsedRealtimeNanos().toDouble() / 1_000_000_000.0
            callbacks.onWillBeginCapture?.invoke()
            if (enableShutterSound) {
              shutterSound.play(MediaActionSound.SHUTTER_CLICK)
            }
            callbacks.onWillCapturePhoto?.invoke()
          },
          { progress ->
            if (progress == 100) {
              // Capture is complete! Saving...
              callbacks.onDidCapturePhoto?.invoke()
              didFireOnDidCapturePhoto = true
            }
          },
          { bitmap ->
            // Preview Image delivered!
            callbacks.onPreviewImageAvailable?.let { onPreviewImageAvailable ->
              val image = HybridImage(bitmap)
              onPreviewImageAvailable(image)
            }
          },
        )

      if (!didFireOnDidCapturePhoto) {
        // Not every device supports progress callbacks, so we just fire it later here
        callbacks.onDidCapturePhoto?.invoke()
      }

      // 3. Return
      val captureTimestamp =
        timestamp ?: throw Error("Photo capture did not report when exposure started!")
      return@async PhotoFile.fromFile(
        file = file,
        imageFormat = result.imageFormat,
        timestamp = captureTimestamp,
        isMirrored = isMirrored,
      )
    }
  }

  override fun prepareSettings(settings: Array<CapturePhotoSettings>): Promise<Unit> {
    return Promise.resolved()
  }
}
