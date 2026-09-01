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

    fun load(context: Context, name: String): FakeCameraCatalog =
      FakeCameraCatalog(SCENE, if (name == "variants") fakeCameraVariantDevices() else fakeCameraDevices())
  }
}

// A second catalog exercising catalog robustness: two near-identical back cameras that differ ONLY in maxZoom,
// plus a front camera. A different device set than `default` proves nothing is hardcoded to it.
private fun variantFormat() = fmt(
  "1080p60", 1920, 1080, "yuv-420-8-bit-video", listOf(1 to 60), listOf(Size(1920, 1080)),
  "phase-detection", listOf("standard"), false, false, listOf("srgb"), false, false, true,
)

private fun twin(id: String, name: String, maxZoom: Double) = FakeCameraDeviceSpec(
  id = id, name = name, modelID = "FakeCamera,1", type = "wide-angle", position = "back",
  hasFlash = true, hasTorch = true, zoom = 1.0 to maxZoom, lensAperture = 1.8, focalLength = 26.0,
  exposureBias = -8 to 8, supportsFocus = true, supportsExposure = true, supportsWhiteBalance = true,
  supportsLowLightBoost = false, formats = listOf(variantFormat()),
)

// A DIFFERENT count and shape than `default` (4 devices vs 3): near-identical twins differing only in maxZoom,
// a telephoto (different type), and a front camera. Proves the pipeline is not hardcoded to the default set.
private fun twinWithFormat(id: String, name: String, format: FakeCameraFormat) = FakeCameraDeviceSpec(
  id = id, name = name, modelID = "FakeCamera,1", type = "wide-angle", position = "back",
  hasFlash = true, hasTorch = true, zoom = 1.0 to 4.0, lensAperture = 1.8, focalLength = 26.0,
  exposureBias = -8 to 8, supportsFocus = true, supportsExposure = true, supportsWhiteBalance = true,
  supportsLowLightBoost = false, formats = listOf(format),
)

// Identical in every capability, differing ONLY in id/name — must both enumerate and never be deduped.
private fun clone(id: String, name: String) = FakeCameraDeviceSpec(
  id = id, name = name, modelID = "FakeCamera,1", type = "wide-angle", position = "back",
  hasFlash = true, hasTorch = true, zoom = 1.0 to 5.0, lensAperture = 2.0, focalLength = 28.0,
  exposureBias = -8 to 8, supportsFocus = true, supportsExposure = true, supportsWhiteBalance = true,
  supportsLowLightBoost = false, formats = listOf(variantFormat()),
)

private fun fakeCameraVariantDevices(): List<FakeCameraDeviceSpec> = listOf(
  twin("fake-twin-a", "Fake Twin A", 4.0),
  twin("fake-twin-b", "Fake Twin B", 6.0),
  // Near-identical to twin-a but its one format tops out at 30 fps — supportsFPS(60) differs.
  twinWithFormat("fake-slow-fps", "Fake Slow FPS", fmt("1080p30", 1920, 1080, "yuv-420-8-bit-video", listOf(1 to 30),
    listOf(Size(1920, 1080)), "phase-detection", listOf("standard"), false, false, listOf("srgb"), false, false, true)),
  // Near-identical to twin-a but its one format is HDR (10-bit) — supportedVideoDynamicRanges differs.
  twinWithFormat("fake-hdr-variant", "Fake HDR Variant", fmt("1080p30-hdr", 1920, 1080, "yuv-420-10-bit-video",
    listOf(1 to 30), listOf(Size(1920, 1080)), "phase-detection", listOf("standard"), false, true,
    listOf("srgb", "hlg-bt2020"), false, false, false)),
  FakeCameraDeviceSpec(
    id = "fake-variant-tele", name = "Fake Variant Telephoto", modelID = "FakeCamera,1", type = "telephoto",
    position = "back", hasFlash = true, hasTorch = true, zoom = 1.0 to 3.0, lensAperture = 2.8, focalLength = 77.0,
    exposureBias = -8 to 8, supportsFocus = true, supportsExposure = true, supportsWhiteBalance = true,
    supportsLowLightBoost = false, formats = listOf(variantFormat()),
  ),
  FakeCameraDeviceSpec(
    id = "fake-variant-front", name = "Fake Variant Front", modelID = "FakeCamera,1", type = "wide-angle",
    position = "front", hasFlash = false, hasTorch = false, zoom = 1.0 to 1.0, lensAperture = 2.2, focalLength = 23.0,
    exposureBias = -8 to 8, supportsFocus = false, supportsExposure = true, supportsWhiteBalance = true,
    supportsLowLightBoost = false,
    formats = listOf(
      fmt("1080p60", 1920, 1080, "yuv-420-8-bit-video", listOf(1 to 60), listOf(Size(1920, 1080)),
        "none", emptyList(), false, false, listOf("srgb"), false, false, false),
    ),
  ),
  clone("fake-clone-a", "Fake Clone A"),
  clone("fake-clone-b", "Fake Clone B"),
)

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
