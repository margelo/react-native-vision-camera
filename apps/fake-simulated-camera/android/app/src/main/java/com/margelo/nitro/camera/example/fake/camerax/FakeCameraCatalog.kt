package com.margelo.nitro.camera.example.fake.camerax

import android.content.Context
import android.util.Size
import org.json.JSONArray
import org.json.JSONObject

// Kotlin mirror of cameras/schema.md. Parsing applies the same rules as scripts/validate-catalog.mjs and
// aborts with a `$.path: message` on any violation.

private const val SCHEMA_VERSION = 1

private val PIXEL_FORMATS = setOf(
  "yuv-420-8-bit-video", "yuv-420-8-bit-full", "yuv-420-10-bit-video", "yuv-420-10-bit-full",
  "yuv-422-8-bit-video", "yuv-422-8-bit-full", "yuv-422-10-bit-video", "yuv-422-10-bit-full",
  "yuv-444-8-bit-video", "yuv-444-8-bit-full", "rgb-bgra-8-bit",
)
private val DEVICE_TYPES = setOf(
  "wide-angle", "ultra-wide-angle", "telephoto", "dual", "dual-wide", "triple", "quad",
  "continuity", "lidar-depth", "true-depth", "time-of-flight-depth", "external",
)
private val POSITIONS = setOf("back", "front")
private val AUTO_FOCUS_SYSTEMS = setOf("none", "contrast-detection", "phase-detection")
private val STABILIZATION_MODES = setOf(
  "standard", "cinematic", "cinematic-extended", "preview-optimized", "cinematic-extended-enhanced", "low-latency",
)
private val COLOR_SPACES = setOf("srgb", "p3-d65", "hlg-bt2020", "apple-log", "apple-log-2")

class CatalogException(message: String) : Exception(message)

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
    fun load(context: Context, name: String): FakeCameraCatalog {
      val json = context.assets.open("cameras/$name.json").bufferedReader().use { it.readText() }
      return parse(json) { scene -> context.assets.list("scenes")?.contains(scene) == true }
    }

    fun parse(json: String, sceneExists: (String) -> Boolean): FakeCameraCatalog {
      val root = JSONObject(json)
      if (root.optInt("schemaVersion", -1) != SCHEMA_VERSION) {
        throw CatalogException("\$.schemaVersion: expected $SCHEMA_VERSION")
      }
      val scene = root.requireString("scene", "$")
      if (!sceneExists(scene)) throw CatalogException("\$.scene: scene file \"$scene\" does not exist in scenes/")
      val devicesJson = root.requireArray("devices", "$")
      val devices = (0 until devicesJson.length()).map { parseDevice(devicesJson.getJSONObject(it), "\$.devices[$it]") }
      requireUnique(devices.map { it.id }, "\$.devices", "device id")
      requireUnique(devices.map { it.name }, "\$.devices", "device name")
      return FakeCameraCatalog(scene, devices)
    }
  }
}

private fun parseDevice(json: JSONObject, path: String): FakeCameraDeviceSpec {
  val formatsJson = json.requireArray("formats", path)
  val formats = (0 until formatsJson.length()).map { parseFormat(formatsJson.getJSONObject(it), "$path.formats[$it]") }
  requireUnique(formats.map { it.name }, "$path.formats", "format name")
  return FakeCameraDeviceSpec(
    id = json.requireString("id", path),
    name = json.requireString("name", path),
    modelID = json.requireString("modelID", path),
    type = json.requireEnum("type", DEVICE_TYPES, path),
    position = json.requireEnum("position", POSITIONS, path),
    hasFlash = json.getBoolean("hasFlash"),
    hasTorch = json.getBoolean("hasTorch"),
    zoom = json.requireDoubleRange("zoom", path, min = 1.0),
    lensAperture = json.requirePositiveDouble("lensAperture", path),
    focalLength = json.requirePositiveDouble("focalLength", path),
    exposureBias = json.requireIntRange("exposureBias", path),
    supportsFocus = json.getBoolean("supportsFocus"),
    supportsExposure = json.getBoolean("supportsExposure"),
    supportsWhiteBalance = json.getBoolean("supportsWhiteBalance"),
    supportsLowLightBoost = json.getBoolean("supportsLowLightBoost"),
    formats = formats,
  )
}

private fun parseFormat(json: JSONObject, path: String): FakeCameraFormat {
  val fpsRangesJson = json.requireArray("fpsRanges", path)
  val fpsRanges = (0 until fpsRangesJson.length()).map {
    val range = fpsRangesJson.getJSONArray(it)
    val lo = range.getInt(0)
    val hi = range.getInt(1)
    if (lo < 1 || lo > hi) throw CatalogException("$path.fpsRanges[$it]: invalid range [$lo, $hi]")
    lo to hi
  }
  if (fpsRanges.isEmpty()) throw CatalogException("$path.fpsRanges: must not be empty")
  val photoJson = json.requireArray("photoDimensions", path)
  val photoDimensions = (0 until photoJson.length()).map {
    val dims = photoJson.getJSONArray(it)
    Size(dims.getInt(0), dims.getInt(1))
  }
  if (photoDimensions.isEmpty()) throw CatalogException("$path.photoDimensions: must not be empty")
  val stabJson = json.requireArray("videoStabilizationModes", path)
  val stabilizationModes = (0 until stabJson.length()).map {
    val mode = stabJson.getString(it)
    if (mode !in STABILIZATION_MODES) throw CatalogException("$path.videoStabilizationModes[$it]: unknown mode $mode")
    mode
  }
  val colorJson = json.requireArray("colorSpaces", path)
  val colorSpaces = (0 until colorJson.length()).map {
    val cs = colorJson.getString(it)
    if (cs !in COLOR_SPACES) throw CatalogException("$path.colorSpaces[$it]: unknown color space $cs")
    cs
  }
  return FakeCameraFormat(
    name = json.requireString("name", path),
    width = json.requirePositiveInt("width", path),
    height = json.requirePositiveInt("height", path),
    pixelFormat = json.requireEnum("pixelFormat", PIXEL_FORMATS, path),
    fpsRanges = fpsRanges,
    photoDimensions = photoDimensions,
    autoFocusSystem = json.requireEnum("autoFocusSystem", AUTO_FOCUS_SYSTEMS, path),
    videoStabilizationModes = stabilizationModes,
    binned = json.getBoolean("binned"),
    videoHDR = json.getBoolean("videoHDR"),
    colorSpaces = colorSpaces,
    highestPhotoQuality = json.getBoolean("highestPhotoQuality"),
    highPhotoQuality = json.getBoolean("highPhotoQuality"),
    multiCam = json.getBoolean("multiCam"),
  )
}

private fun JSONObject.requireString(key: String, path: String): String {
  val value = optString(key, "")
  if (value.isEmpty()) throw CatalogException("$path.$key: missing or empty")
  return value
}

private fun JSONObject.requireEnum(key: String, allowed: Set<String>, path: String): String {
  val value = requireString(key, path)
  if (value !in allowed) throw CatalogException("$path.$key: unknown value \"$value\"")
  return value
}

private fun JSONObject.requireArray(key: String, path: String): JSONArray =
  optJSONArray(key) ?: throw CatalogException("$path.$key: expected array")

private fun JSONObject.requirePositiveInt(key: String, path: String): Int {
  val value = getInt(key)
  if (value <= 0) throw CatalogException("$path.$key: must be a positive integer")
  return value
}

private fun JSONObject.requirePositiveDouble(key: String, path: String): Double {
  val value = getDouble(key)
  if (value <= 0) throw CatalogException("$path.$key: must be positive")
  return value
}

private fun JSONObject.requireDoubleRange(key: String, path: String, min: Double): Pair<Double, Double> {
  val range = requireArray(key, path)
  val lo = range.getDouble(0)
  val hi = range.getDouble(1)
  if (lo < min || lo > hi) throw CatalogException("$path.$key: invalid range [$lo, $hi]")
  return lo to hi
}

private fun JSONObject.requireIntRange(key: String, path: String): Pair<Int, Int> {
  val range = requireArray(key, path)
  val lo = range.getInt(0)
  val hi = range.getInt(1)
  if (lo > hi) throw CatalogException("$path.$key: invalid range [$lo, $hi]")
  return lo to hi
}

private fun requireUnique(values: List<String>, path: String, what: String) {
  val seen = mutableSetOf<String>()
  values.forEachIndexed { index, value ->
    if (!seen.add(value)) throw CatalogException("$path[$index]: duplicate $what \"$value\"")
  }
}
