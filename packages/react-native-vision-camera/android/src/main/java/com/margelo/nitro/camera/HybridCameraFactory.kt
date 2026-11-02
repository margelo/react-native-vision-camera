package com.margelo.nitro.camera

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import androidx.annotation.Keep
import androidx.camera.core.SurfaceOrientedMeteringPointFactory
import androidx.camera.lifecycle.ProcessCameraProvider
import com.facebook.proguard.annotations.DoNotStrip
import com.facebook.react.bridge.ReactApplicationContext
import com.margelo.nitro.NitroModules
import com.margelo.nitro.camera.extensions.await
import com.margelo.nitro.camera.extensions.getPermissionStatus
import com.margelo.nitro.camera.extensions.requestPermission
import com.margelo.nitro.camera.hybrids.HybridCameraSession
import com.margelo.nitro.camera.hybrids.HybridCameraSessionConfig
import com.margelo.nitro.camera.hybrids.HybridFrameRenderer
import com.margelo.nitro.camera.hybrids.gestures.HybridTapToFocusGestureController
import com.margelo.nitro.camera.hybrids.gestures.HybridZoomGestureController
import com.margelo.nitro.camera.hybrids.metering.HybridMeteringPoint
import com.margelo.nitro.camera.hybrids.orientation.HybridDeviceOrientationManager
import com.margelo.nitro.camera.hybrids.orientation.HybridInterfaceOrientationManager
import com.margelo.nitro.camera.hybrids.outputs.HybridDepthFrameOutput
import com.margelo.nitro.camera.hybrids.outputs.HybridFrameOutput
import com.margelo.nitro.camera.hybrids.outputs.HybridPhotoOutput
import com.margelo.nitro.camera.hybrids.outputs.HybridPreviewOutput
import com.margelo.nitro.camera.hybrids.outputs.HybridVideoOutput
import com.margelo.nitro.camera.public.NativeCameraDevice
import com.margelo.nitro.camera.session.ConstraintResolver
import com.margelo.nitro.core.Promise

@Suppress("unused")
@Keep
@DoNotStrip
class VisionCamera : HybridCameraFactorySpec() {
  val context: ReactApplicationContext
    get() = NitroModules.applicationContext ?: throw Error("No ApplicationContext set!")
  val cameraProviderFuture = ProcessCameraProvider.getInstance(context)

  override val cameraPermissionStatus: PermissionStatus
    get() = context.getPermissionStatus(Manifest.permission.CAMERA)
  override val microphonePermissionStatus: PermissionStatus
    get() = context.getPermissionStatus(Manifest.permission.RECORD_AUDIO)
  override val supportsMultiCamSessions: Boolean
    @SuppressLint("InlinedApi")
    get() = context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_CONCURRENT)
  private val normalizedMeteringPointFactory: SurfaceOrientedMeteringPointFactory by lazy {
    SurfaceOrientedMeteringPointFactory(1f, 1f)
  }

  override fun requestCameraPermission(): Promise<Boolean> {
    return Promise.async {
      return@async context.requestPermission(Manifest.permission.CAMERA)
    }
  }

  override fun requestMicrophonePermission(): Promise<Boolean> {
    return Promise.async {
      return@async context.requestPermission(Manifest.permission.RECORD_AUDIO)
    }
  }

  override fun createCameraSession(enableMultiCam: Boolean): Promise<HybridCameraSessionSpec> {
    return Promise.async {
      val cameraProvider = cameraProviderFuture.await()
      return@async HybridCameraSession(cameraProvider)
    }
  }

  override fun resolveConstraints(
    device: HybridCameraDeviceSpec,
    outputConfigurations: Array<CameraOutputConfiguration>,
    constraints: Array<Constraint>,
    requiresMultiCam: Boolean?,
  ): Promise<HybridCameraSessionConfigSpec> {
    return Promise.async {
      val device =
        device as? NativeCameraDevice
          ?: throw Error("The given `device` was not of type `NativeCameraDevice`!")
      val config = ConstraintResolver.resolveConstraints(device.cameraInfo, outputConfigurations, constraints)
      return@async HybridCameraSessionConfig(config.sessionConfig, config.resolvedConfig)
    }
  }

  override fun createDeviceFactory(): Promise<HybridCameraDeviceFactorySpec> {
    return Promise.async {
      val cameraProvider = cameraProviderFuture.await()
      return@async HybridCameraDeviceFactory(cameraProvider)
    }
  }

  override fun createPhotoOutput(options: PhotoOutputOptions): HybridCameraPhotoOutputSpec {
    return HybridPhotoOutput(options)
  }

  override fun createVideoOutput(options: VideoOutputOptions): HybridCameraVideoOutputSpec {
    return HybridVideoOutput(options)
  }

  override fun createFrameOutput(options: FrameOutputOptions): HybridCameraFrameOutputSpec {
    return HybridFrameOutput(options)
  }

  override fun createDepthFrameOutput(options: DepthFrameOutputOptions): HybridCameraDepthFrameOutputSpec {
    return HybridDepthFrameOutput(options)
  }

  override fun createPreviewOutput(options: PreviewOutputOptions): HybridCameraPreviewOutputSpec {
    return HybridPreviewOutput(options)
  }

  override fun createObjectOutput(options: ObjectOutputOptions): HybridCameraObjectOutputSpec {
    throw Error("CameraObjectOutput is not available on Android!")
  }

  override fun createOutputSynchronizer(outputs: Array<HybridCameraOutputSpec>): HybridCameraOutputSynchronizerSpec {
    throw Error("OutputSynchronizer is not available on Android!")
  }

  override fun createZoomGestureController(): HybridZoomGestureControllerSpec {
    return HybridZoomGestureController()
  }

  override fun createTapToFocusGestureController(): HybridTapToFocusGestureControllerSpec {
    return HybridTapToFocusGestureController()
  }

  override fun createOrientationManager(orientationSource: OrientationSource): HybridOrientationManagerSpec {
    return when (orientationSource) {
      OrientationSource.INTERFACE -> HybridInterfaceOrientationManager()
      OrientationSource.DEVICE -> HybridDeviceOrientationManager()
    }
  }

  override fun createFrameRenderer(): HybridFrameRendererSpec {
    return HybridFrameRenderer()
  }

  override fun createNormalizedMeteringPoint(
    x: Double,
    y: Double,
    size: Double?,
  ): HybridMeteringPointSpec {
    val meteringPoint =
      if (size != null) {
        normalizedMeteringPointFactory.createPoint(x.toFloat(), y.toFloat(), size.toFloat())
      } else {
        normalizedMeteringPointFactory.createPoint(x.toFloat(), y.toFloat())
      }
    return HybridMeteringPoint(
      x,
      y,
      size,
      meteringPoint,
    )
  }
}
