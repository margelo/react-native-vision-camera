package androidx.camera.testing.fakes

import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.FocusMeteringResult
import androidx.camera.core.ImageCapture
import androidx.camera.core.impl.CameraControlInternal
import androidx.camera.core.impl.CaptureConfig
import androidx.camera.core.impl.Config
import androidx.camera.core.impl.MutableOptionsBundle
import androidx.camera.core.impl.SessionConfig
import androidx.camera.core.impl.utils.futures.Futures
import com.google.common.util.concurrent.ListenableFuture

// Replaces upstream FakeCameraControl (which drags in image-capture simulation): every control call
// succeeds immediately and is remembered, nothing is captured.
class FakeCameraControl(
  private val updateCallback: CameraControlInternal.ControlUpdateCallback,
) : CameraControlInternal {
  private var flashMode = ImageCapture.FLASH_MODE_OFF
  private var zslDisabled = false
  private var interopConfig: Config = MutableOptionsBundle.create()
  var torchEnabled = false
    private set
  var zoomRatio = 1f
    private set
  var linearZoom = 0f
    private set
  var exposureCompensationIndex = 0
    private set
  var lastFocusMeteringAction: FocusMeteringAction? = null
    private set

  override fun getFlashMode(): Int = flashMode

  override fun setFlashMode(flashMode: Int) {
    this.flashMode = flashMode
  }

  override fun addZslConfig(sessionConfigBuilder: SessionConfig.Builder) {}

  override fun clearZslConfig() {}

  override fun setZslDisabledByUserCaseConfig(disabled: Boolean) {
    zslDisabled = disabled
  }

  override fun isZslDisabledByByUserCaseConfig(): Boolean = zslDisabled

  override fun submitStillCaptureRequests(
    captureConfigs: List<CaptureConfig>,
    captureMode: Int,
    flashType: Int,
  ): ListenableFuture<List<Void>> = Futures.immediateFuture(emptyList())

  override fun getSessionConfig(): SessionConfig = SessionConfig.defaultEmptySessionConfig()

  override fun addInteropConfig(config: Config) {
    interopConfig = config
  }

  override fun clearInteropConfig() {
    interopConfig = MutableOptionsBundle.create()
  }

  override fun getInteropConfig(): Config = interopConfig

  override fun enableTorch(torch: Boolean): ListenableFuture<Void> {
    torchEnabled = torch
    return Futures.immediateFuture(null)
  }

  override fun startFocusAndMetering(action: FocusMeteringAction): ListenableFuture<FocusMeteringResult> {
    lastFocusMeteringAction = action
    return Futures.immediateFuture(FocusMeteringResult.create(true))
  }

  override fun cancelFocusAndMetering(): ListenableFuture<Void> {
    lastFocusMeteringAction = null
    return Futures.immediateFuture(null)
  }

  override fun setZoomRatio(ratio: Float): ListenableFuture<Void> {
    zoomRatio = ratio
    return Futures.immediateFuture(null)
  }

  override fun setLinearZoom(linearZoom: Float): ListenableFuture<Void> {
    this.linearZoom = linearZoom
    return Futures.immediateFuture(null)
  }

  override fun setExposureCompensationIndex(value: Int): ListenableFuture<Int> {
    exposureCompensationIndex = value
    return Futures.immediateFuture(value)
  }
}
