package com.margelo.nitro.camera.example.fake

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Stash the requested catalog before React Native (and CameraX) initialise.
    FakeCameraInjection.catalogName = intent?.getStringExtra("fakeCameraCatalog") ?: FakeCameraInjection.catalogName
    super.onCreate(savedInstanceState)
  }

  override fun getMainComponentName(): String = "FakeSimulatedCamera"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
