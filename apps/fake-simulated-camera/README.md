# FakeSimulatedCamera

A Harness test app that runs the VisionCamera suites on the **iOS Simulator** and the **Android Emulator** against a camera we define ourselves, so Constraint Resolver, device-enumeration and barcode-scanner behaviour can be hard-asserted (the real-device track in `apps/simple-camera` can only soft-assert what unknown hardware supports).

The injection lives entirely inside this app. `packages/react-native-vision-camera*` is never modified — the library runs its production AVFoundation / CameraX code paths against fake objects (`bun fake check-packages-untouched` verifies that for the current change set).

## What is injected

| Platform | Mechanism | Where |
|---|---|---|
| iOS Simulator | AVFoundation runtime hooks installed by `AppDelegate` (Debug + Simulator only): fake `AVCaptureDevice`/`AVCaptureDevice.Format` objects from the catalog, fake inputs/connections for `AVCaptureSession`, a frame pump that streams the scene image into `AVCaptureVideoDataOutput`s | `ios/FakeSimulatedCamera/FakeCamera/` |
| Android Emulator (`android` runner) | `MainApplication` implements `CameraXConfig.Provider` and supplies a catalog-driven fake CameraX backend (vendored AOSP `camera-testing` fakes) plus a Camera2 interop bridge | `android/app/src/main/java/.../fake/` |
| Android Emulator (`android-scene` runner) | No injection (`fakeCameraCatalog=off`): the emulator's real virtual-scene camera looks at the scene image via `emulator -virtualscene-poster wall=<scenes/…>` | emulator flag |

The cameras are described in [`cameras/default.json`](cameras/default.json) — see [`cameras/schema.md`](cameras/schema.md) for every field and its per-platform projection. Add another `cameras/<name>.json` and launch with `FAKE_CAMERA_CATALOG=<name>` to emulate a different camera.

## Running

```sh
bun install                      # repo root
bun fake validate-catalog        # schema check for cameras/*.json
bun fake pods                    # once, CocoaPods

# iOS Simulator
bun fake build:ios-simulator     # prints HARNESS_APP_PATH=…
HARNESS_APP_PATH=<path> HARNESS_IOS_SIMULATOR="iPhone 17 Pro" HARNESS_IOS_SIMULATOR_VERSION=26.5 bun fake test:harness:ios

# Android Emulator (fake catalog through CameraX)
bun fake build:android
emulator -avd Pixel_API_35 -camera-back virtualscene -virtualscene-poster wall=$PWD/apps/fake-simulated-camera/scenes/qr-code-margelo.png &
adb shell settings put global hidden_api_policy 1
HARNESS_ANDROID_DEVICE_MODE=emulator bun fake test:harness:android

# Android Emulator (real Camera2, virtual-scene QR poster)
HARNESS_ANDROID_DEVICE_MODE=emulator bun fake test:harness:android-scene
```

CI: `.github/workflows/harness-simulator.yml`.

## Tests

Same rules as [`apps/simple-camera/__tests__/README.md`](../simple-camera/__tests__/README.md). Files:

- `fakecamera.devices.harness.ts` — enumeration matches the catalog.
- `fakecamera.session.harness.ts` — configure/reconfigure/start/stop, asserted through public effects.
- `fakecamera.constraints.harness.ts` — deterministic `resolveConstraints` results.
- `fakecamera.barcode-scanner.harness.ts` — the scanner output sees the QR code in the scene (iOS fake mode, Android scene mode).
- `fakecamera.scene.harness.ts` — Android scene runner only.

Where platforms intentionally differ, each platform has its own focused `it` with a static platform guard.

## Known limitations

- iOS fake: no photo capture, no video recording, no depth/metadata outputs, no multi-cam; frames are BGRA and not physically rotated; formats above 60 fps stream at 60.
- Android fake: no frames (the scene runner covers the barcode E2E); per-format coupling such as "60 fps only at 1080p" cannot be expressed through CameraX.
