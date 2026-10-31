package com.margelo.nitro.camera.example.fake

import android.app.Application
import androidx.camera.camera2.Camera2Config
import androidx.camera.core.CameraXConfig
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.margelo.nitro.camera.example.fake.camerax.FakeCameraCatalog
import com.margelo.nitro.camera.example.fake.camerax.FakeCameraCatalogConfig

class MainApplication :
  Application(),
  ReactApplication,
  CameraXConfig.Provider {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList = PackageList(this).packages,
    )
  }

  // VisionCamera initialises CameraX lazily via ProcessCameraProvider, which calls this after MainActivity
  // has stashed the requested catalog.
  override fun getCameraXConfig(): CameraXConfig {
    if (FakeCameraInjection.isEnabled) {
      val catalog = FakeCameraCatalog.load(this, FakeCameraInjection.catalogName)
      return FakeCameraCatalogConfig.create(catalog)
    }
    return Camera2Config.defaultConfig()
  }

  override fun onCreate() {
    super.onCreate()
    FakeCameraInjection.logStartup(this)
    loadReactNative(this)
  }
}
