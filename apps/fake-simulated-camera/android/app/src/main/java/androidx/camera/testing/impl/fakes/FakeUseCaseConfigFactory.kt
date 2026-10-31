package androidx.camera.testing.impl.fakes

import android.hardware.camera2.CameraDevice
import androidx.camera.core.ImageCapture
import androidx.camera.core.impl.Config
import androidx.camera.core.impl.MutableOptionsBundle
import androidx.camera.core.impl.OptionsBundle
import androidx.camera.core.impl.SessionConfig
import androidx.camera.core.impl.UseCaseConfig
import androidx.camera.core.impl.UseCaseConfigFactory

// Replaces upstream FakeUseCaseConfigFactory (which wires a TakePictureManager test wrapper).
class FakeUseCaseConfigFactory : UseCaseConfigFactory {
  override fun getConfig(captureType: UseCaseConfigFactory.CaptureType, captureMode: Int): Config {
    val config = MutableOptionsBundle.create()
    val sessionBuilder = SessionConfig.Builder()
    sessionBuilder.setTemplateType(templateType(captureType, captureMode))
    config.insertOption(UseCaseConfig.OPTION_DEFAULT_SESSION_CONFIG, sessionBuilder.build())
    config.insertOption(UseCaseConfig.OPTION_CAPTURE_CONFIG_UNPACKER, CaptureConfigUnpacker)
    config.insertOption(UseCaseConfig.OPTION_SESSION_CONFIG_UNPACKER, FakeSessionConfigOptionUnpacker())
    return OptionsBundle.from(config)
  }

  private object CaptureConfigUnpacker : androidx.camera.core.impl.CaptureConfig.OptionUnpacker {
    override fun unpack(config: UseCaseConfig<*>, builder: androidx.camera.core.impl.CaptureConfig.Builder) {}
  }

  private fun templateType(captureType: UseCaseConfigFactory.CaptureType, captureMode: Int): Int =
    when (captureType) {
      UseCaseConfigFactory.CaptureType.IMAGE_CAPTURE ->
        if (captureMode == ImageCapture.CAPTURE_MODE_ZERO_SHUTTER_LAG) CameraDevice.TEMPLATE_ZERO_SHUTTER_LAG else CameraDevice.TEMPLATE_PREVIEW
      UseCaseConfigFactory.CaptureType.VIDEO_CAPTURE -> CameraDevice.TEMPLATE_RECORD
      else -> CameraDevice.TEMPLATE_PREVIEW
    }
}
