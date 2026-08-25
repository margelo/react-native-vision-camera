# Fake camera catalog (`cameras/*.json`, `schemaVersion` 1)

One catalog describes every camera the app injects. It is bundled into the iOS app (`cameras/<name>.json` resource) and the Android app (`assets/cameras/<name>.json`), and imported by the Harness tests. `bun fake validate-catalog` and both native loaders apply the same rules and fail with path-specific errors (`$.devices[0].formats[2].fpsRanges[0]: …`).

Pick a catalog at launch: iOS launch argument `-FakeCameraCatalog <name>`, Android intent extra `fakeCameraCatalog=<name>` (`off` = no injection, real Camera2), env `FAKE_CAMERA_CATALOG` for the Harness runners. Default: `default`.

## Top level

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | `1` | Rejected if different. |
| `scene` | file name in `scenes/` | Image streamed as the camera feed (iOS frame pump) and used as the emulator virtual-scene poster. |
| `devices` | non-empty array | Cameras, in enumeration order. |

## Device

| Field | Type | iOS projection | Android projection |
|---|---|---|---|
| `id` | unique string | `AVCaptureDevice.uniqueID` | CameraX camera id (exposed through the Camera2 interop seam) |
| `name` | unique string | `localizedName` | — (VisionCamera derives names from position) |
| `modelID` | string | `modelID` | — |
| `type` | `DeviceType` (`wide-angle`, `ultra-wide-angle`, `telephoto`, `dual`, `dual-wide`, `triple`, `quad`, `continuity`, `lidar-depth`, `true-depth`, `time-of-flight-depth`, `external`) | `deviceType` | intrinsic zoom ratio (<1 ultra-wide, >1 telephoto, else wide) |
| `position` | `back` \| `front` | `position` | lens facing |
| `hasFlash`, `hasTorch` | boolean | `hasFlash` / `hasTorch` | flash unit (`hasFlashUnit`) |
| `zoom` | `[min, max]`, min ≥ 1 | `min/maxAvailableVideoZoomFactor` | zoom state |
| `lensAperture` | number > 0 | `lensAperture` | `LENS_INFO_AVAILABLE_APERTURES` (only when Camera2 characteristics can be built) |
| `focalLength` | number > 0 (35mm-equivalent mm) | `nominalFocalLengthIn35mmFilm` (iOS 26+) | `LENS_INFO_AVAILABLE_FOCAL_LENGTHS` (same gate) |
| `exposureBias` | `[min, max]` | `min/maxExposureTargetBias` | exposure compensation range |
| `supportsFocus` | boolean | focus modes + point of interest | focus metering |
| `supportsExposure` | boolean | exposure modes + point of interest | exposure metering |
| `supportsWhiteBalance` | boolean | white-balance modes | white-balance metering |
| `supportsLowLightBoost` | boolean | `isLowLightBoostSupported` | `isLowLightBoostSupported` |
| `formats` | non-empty array | one `AVCaptureDevice.Format` each, in order | merged into device-wide CameraX capabilities (see below) |

## Format

| Field | Type | iOS projection | Android projection |
|---|---|---|---|
| `name` | unique per device | (label only) | (label only) |
| `width`, `height` | positive ints | `formatDescription` dimensions | PRIVATE/YUV stream size |
| `pixelFormat` | `VideoPixelFormat` (`yuv-420-8-bit-video`, `yuv-420-8-bit-full`, `yuv-420-10-bit-video`, `yuv-420-10-bit-full`, `yuv-422-*`, `yuv-444-*`, `rgb-bgra-8-bit`) | `formatDescription.mediaSubType` | — (CameraX always reports `private`) |
| `fpsRanges` | non-empty `[[min, max]]`, min ≥ 1 | `videoSupportedFrameRateRanges` | union across formats → device-wide ranges |
| `photoDimensions` | non-empty `[[w, h]]` | `supportedMaxPhotoDimensions` | JPEG stream sizes |
| `autoFocusSystem` | `none` \| `contrast-detection` \| `phase-detection` | `autoFocusSystem` | — |
| `videoStabilizationModes` | subset of `standard`, `cinematic`, `cinematic-extended`, `preview-optimized`, `cinematic-extended-enhanced`, `low-latency` | `isVideoStabilizationModeSupported:` (`off`/`auto` always true) | any non-empty list → CameraX video + preview stabilization supported |
| `binned` | boolean | `isVideoBinned` | — |
| `videoHDR` | boolean | `isVideoHDRSupported` | any `true` → `DynamicRange.HLG_10_BIT` supported |
| `colorSpaces` | non-empty subset of `srgb`, `p3-d65`, `hlg-bt2020`, `apple-log`, `apple-log-2` | `supportedColorSpaces` | — |
| `highestPhotoQuality`, `highPhotoQuality` | boolean | `isHighestPhotoQualitySupported` / `isHighPhotoQualitySupported` | any `true` → `JPEG_R` (photo HDR) advertised |
| `multiCam` | boolean | `isMultiCamSupported` | — |

Android cannot express per-format coupling (e.g. "60 fps only at 1080p"); its projection is device-wide by design.
