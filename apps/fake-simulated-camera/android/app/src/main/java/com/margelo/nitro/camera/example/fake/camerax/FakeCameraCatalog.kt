package com.margelo.nitro.camera.example.fake.camerax

import android.content.Context
import android.util.Size

// The fake cameras are authored directly in Kotlin (no JSON). Values mirror the iOS fake so both platforms model
// the same devices; each platform then projects them onto its own camera framework (CameraX / Camera2 here).

data class FakeCameraFormat(
  val name: String,
  val width: Int,
  val height: Int,
  val pixelFormat: String,
  val fpsRanges: List<Pair<Int, Int>>,
  val photoDimensions: List<Size>,
  val autoFocusSystem: String,
  val videoStabilizationModes: List<String>,
  val binned: Boolean,
  val videoHDR: Boolean,
  val colorSpaces: List<String>,
  val highestPhotoQuality: Boolean,
  val highPhotoQuality: Boolean,
  val multiCam: Boolean,
)

data class FakeCameraDeviceSpec(
  val id: String,
  val name: String,
  val modelID: String,
  val type: String,
  val position: String,
  val hasFlash: Boolean,
  val hasTorch: Boolean,
  val zoom: Pair<Double, Double>,
  val lensAperture: Double,
  val focalLength: Double,
  val exposureBias: Pair<Int, Int>,
  val supportsFocus: Boolean,
  val supportsExposure: Boolean,
  val supportsWhiteBalance: Boolean,
  val supportsLowLightBoost: Boolean,
  val formats: List<FakeCameraFormat>,
)

data class FakeCameraCatalog(val scene: String, val devices: List<FakeCameraDeviceSpec>) {
  companion object {
    private const val SCENE = "qr-code-margelo.png"

    fun load(context: Context, name: String): FakeCameraCatalog = FakeCameraCatalog(SCENE, fakeCameraDevices())
  }
}

private fun fmt(
  name: String,
  width: Int,
  height: Int,
  pixelFormat: String,
  fpsRanges: List<Pair<Int, Int>>,
  photoDimensions: List<Size>,
  autoFocusSystem: String,
  videoStabilizationModes: List<String>,
  binned: Boolean,
  videoHDR: Boolean,
  colorSpaces: List<String>,
  highestPhotoQuality: Boolean,
  highPhotoQuality: Boolean,
  multiCam: Boolean,
) = FakeCameraFormat(
  name, width, height, pixelFormat, fpsRanges, photoDimensions, autoFocusSystem, videoStabilizationModes,
  binned, videoHDR, colorSpaces, highestPhotoQuality, highPhotoQuality, multiCam,
)

private fun fakeCameraDevices(): List<FakeCameraDeviceSpec> = listOf(
  FakeCameraDeviceSpec(
    id = "fake-back-wide",
    name = "Fake Back Wide Camera",
    modelID = "FakeCamera,1",
    type = "wide-angle",
    position = "back",
    hasFlash = true,
    hasTorch = true,
    zoom = 1.0 to 6.0,
    lensAperture = 1.6,
    focalLength = 24.0,
    exposureBias = -8 to 8,
    supportsFocus = true,
    supportsExposure = true,
    supportsWhiteBalance = true,
    supportsLowLightBoost = false,
    formats = listOf(
      fmt("1080p60", 1920, 1080, "yuv-420-8-bit-video", listOf(1 to 60), listOf(Size(1920, 1080)),
        "phase-detection", listOf("standard", "cinematic"), false, false, listOf("srgb"), false, false, true),
      fmt("4k30", 3840, 2160, "yuv-420-8-bit-full", listOf(1 to 30), listOf(Size(4032, 3024), Size(3840, 2160)),
        "phase-detection", listOf("standard"), false, false, listOf("srgb", "p3-d65"), true, true, false),
      fmt("1080p30-hdr", 1920, 1080, "yuv-420-10-bit-video", listOf(1 to 30), listOf(Size(1920, 1080)),
        "phase-detection", listOf("standard", "cinematic"), false, true, listOf("srgb", "p3-d65", "hlg-bt2020"),
        false, false, false),
      fmt("720p240-binned", 1280, 720, "yuv-420-8-bit-video", listOf(1 to 240), listOf(Size(1280, 720)),
        "contrast-detection", emptyList(), true, false, listOf("srgb"), false, false, true),
    ),
  ),
  FakeCameraDeviceSpec(
    id = "fake-back-ultra-wide",
    name = "Fake Back Ultra Wide Camera",
    modelID = "FakeCamera,1",
    type = "ultra-wide-angle",
    position = "back",
    hasFlash = true,
    hasTorch = true,
    zoom = 1.0 to 1.0,
    lensAperture = 2.4,
    focalLength = 13.0,
    exposureBias = -8 to 8,
    supportsFocus = false,
    supportsExposure = true,
    supportsWhiteBalance = true,
    supportsLowLightBoost = false,
    formats = listOf(
      fmt("1080p30", 1920, 1080, "yuv-420-8-bit-video", listOf(1 to 30), listOf(Size(1920, 1080)),
        "none", emptyList(), false, false, listOf("srgb"), false, false, false),
    ),
  ),
  FakeCameraDeviceSpec(
    id = "fake-front-wide",
    name = "Fake Front Camera",
    modelID = "FakeCamera,1",
    type = "wide-angle",
    position = "front",
    hasFlash = false,
    hasTorch = false,
    zoom = 1.0 to 1.0,
    lensAperture = 2.2,
    focalLength = 23.0,
    exposureBias = -8 to 8,
    supportsFocus = false,
    supportsExposure = true,
    supportsWhiteBalance = true,
    supportsLowLightBoost = false,
    formats = listOf(
      fmt("1080p60", 1920, 1080, "yuv-420-8-bit-video", listOf(1 to 60), listOf(Size(1920, 1080)),
        "none", listOf("standard"), false, false, listOf("srgb"), false, false, true),
      fmt("720p30", 1280, 720, "yuv-420-8-bit-video", listOf(1 to 30), listOf(Size(1280, 720)),
        "none", emptyList(), false, false, listOf("srgb"), false, false, false),
    ),
  ),
)
