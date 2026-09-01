package com.margelo.nitro.camera.example.fake

import android.content.Context
import android.util.Log
import java.security.MessageDigest

// Selected by the `fakeCameraCatalog` launch extra (or FAKE_CAMERA_CATALOG); `off` disables injection so the
// emulator's real Camera2 virtual-scene camera is used instead.
object FakeCameraInjection {
  private const val TAG = "FakeCamera"

  @Volatile
  var catalogName: String = System.getenv("FAKE_CAMERA_CATALOG") ?: "default"

  val isEnabled: Boolean
    get() = catalogName != "off"

  fun logStartup(context: Context) {
    if (!isEnabled) {
      Log.i(TAG, "mode=real-camera2 (no injection)")
      return
    }
    try {
      val catalog = com.margelo.nitro.camera.example.fake.camerax.FakeCameraCatalog.load(context, catalogName)
      val ids = catalog.devices.joinToString(",") { it.id }
      val scene = context.assets.open("scenes/${catalog.scene}").use { it.readBytes() }
      val sha = MessageDigest.getInstance("SHA-256").digest(scene).joinToString("") { "%02x".format(it) }
      Log.i(TAG, "mode=fake:$catalogName devices=$ids scene=${catalog.scene} sha256=$sha")
    } catch (error: Throwable) {
      Log.e(TAG, "catalog $catalogName rejected", error)
    }
  }
}
