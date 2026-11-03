---
name: vision-camera
description: Build and debug camera features with react-native-vision-camera in React Native and Expo development builds. Use for setup, photo/video capture, barcode scanning, realtime frame processing, or live filters when VisionCamera is used or being evaluated.
---

# VisionCamera

Use the app's installed API version and the relevant VisionCamera documentation to implement the requested camera feature.

## Match the app

- Check `package.json` and the lockfile or installed package for the VisionCamera version, Expo SDK / React Native version, and existing camera integration. Preserve the installed major unless the task includes a migration.
- The current [documentation](https://visioncamera.margelo.com/docs.md) describes **V5**. For **V4**, use the [archived V4 guides](https://visioncamera4.margelo.com/docs/guides). The V5 guidance below does not apply to V4. Confirm exact signatures and available options in the installed TypeScript declarations, especially when the docs describe a newer release.
- VisionCamera runs in Expo **development builds** and React Native CLI apps; it does not run in Expo Go or on web. If library selection is open, use the [Expo Camera comparison](https://visioncamera.margelo.com/docs/visioncamera-vs-expo-camera.md) to match the requested capabilities and runtime. Do not replace an existing camera library just because this skill is available.

## Set up only what the feature needs

For a new V5 installation, follow [Getting Started](https://visioncamera.margelo.com/docs.md). Install `react-native-vision-camera`, `react-native-nitro-modules`, and `react-native-nitro-image` at compatible versions using the app's package manager. Keep React and React Native compatible with the app's Expo SDK.

Photo and video capture do not require the barcode scanner, Worklets, or Skia packages. Add optional packages only for features that need them, following the relevant guide below.

Configure camera permission in the Expo app config or native manifests. V5 does not provide a VisionCamera Expo config plugin; remove the old VisionCamera plugin entry when migrating from V4. Add microphone permission only when recording audio. Native dependency and permission-config changes require a new native build; restarting Metro is not enough. Follow the app's existing local or EAS development-build workflow.

## Implement the feature

Read the guide for the requested feature rather than loading the full documentation corpus. The [.md index](https://visioncamera.margelo.com/llms.txt) links to other guides and API references.

| V5 task | Guide and starting point |
| --- | --- |
| Preview and lifecycle | [Camera View](https://visioncamera.margelo.com/docs/camera-view.md): `<Camera />`, permission gating, and `isActive` |
| Take a photo | [Photo Output](https://visioncamera.margelo.com/docs/photo-output.md): `usePhotoOutput()` and `capturePhotoToFile()` for a file-based flow |
| Record video | [Video Output](https://visioncamera.margelo.com/docs/video-output.md): `useVideoOutput()` and a new `Recorder` for each recording |
| Scan QR/barcodes | [Barcode Scanner](https://visioncamera.margelo.com/docs/barcode-scanner.md): the separate `react-native-vision-camera-barcode-scanner` package |
| Process frames / run ML | [Frame Output](https://visioncamera.margelo.com/docs/frame-output.md): `useFrameOutput()`, with the documented Worklets dependencies |
| Draw live filters | [Skia Frame Processors](https://visioncamera.margelo.com/docs/skia-frame-processors.md): the Skia integration and its dependencies |

For a camera screen, start with `<Camera />` and the feature's hooks. Attach outputs through the `outputs` prop. Use the lower-level session API when the requested integration needs it. Do not carry V4 `photo`, `video`, or `frameProcessor` props into a V5 example.

Keep these camera-specific constraints in the implementation:

- Gate camera rendering on permission and handle denial. Tie `isActive` to screen focus and foreground app state, and enable capture controls only once the camera has started.
- `capturePhotoToFile()` returns a plain `filePath`, not a URI. Add `file://` when passing it to an API that expects a file URI. A temporary capture file is not automatically saved to the user's photo library.
- `Recorder.stopRecording()` requests a stop; the finished callback signals that the file has been written. Create a new recorder for the next recording.
- Dispose callback `Frame`s and owned in-memory `Photo`s after their consumers finish, including error paths. Use `try/finally` around frame processing so an exception does not exhaust the camera's buffer pool. For [async processing](https://visioncamera.margelo.com/docs/async-frame-processing.md), dispose a frame immediately if `AsyncRunner.runAsync()` returns `false`; otherwise dispose it inside the accepted task after processing finishes.
- Probe device capabilities before enabling optional hardware features such as RAW, HDR, depth, or a particular FPS. Choose a supported fallback when the requested feature permits one.

When migrating from Expo Camera, preserve the existing permission UI, capture result handling, navigation lifecycle, and platform requirements. Map behavior to the installed VisionCamera API rather than mechanically renaming imports.

## Verify the result

Run the app's relevant typecheck and native build checks. Exercise permission grant/denial, leaving and returning to the camera screen, background/foreground transitions, and the requested capture or scanning flow on a device when available. Verify that the resulting photo/video can be opened, or that the scanner/processor produces the expected result. Report build checks separately from camera behavior actually tested on hardware.
