# VisionCamera Harness Tests

This folder contains the on-device test suite for the VisionCamera imperative API. Tests run on a real phone (local `adb` device or an AWS Device Farm device) through [react-native-harness](https://www.react-native-harness.dev), which embeds a Jest-compatible runner in the `simple-camera` app and talks to it over a Metro-driven bridge.

For LLMs, ensure you understand [Harness' llms.txt file](https://www.react-native-harness.dev/llms-full.txt) before hallucinating APIs.

## Why these tests exist

Two goals, in order:

1. **Regressions in the public API surface fail CI automatically.** Every feature of `VisionCamera` that this library supports on real hardware has a test here. If a refactor breaks `capturePhoto`, the CI run turns red on the next PR.
2. **Bug reports become executable.** Anyone who finds a bug is expected to open a PR here that adds a single failing test reproducing the issue — **not** a separate reproduction repo. The maintainer fixes the bug on the same branch until the CI goes green, and the test is merged along with the fix. That way the same bug can never regress silently again.

**If you are reporting a bug:** open a PR that adds the smallest possible `it(...)` block somewhere under this folder, aligned with the rules below. Then open the issue referencing the PR — the CI run on the PR is the reproduction. You do **not** need to create a separate repo.

## Layout

Tests are split by domain. Each file tests one slice of the imperative `VisionCamera` API:

| File | Covers |
|------|--------|
| [visioncamera.devices.harness.ts](visioncamera.devices.harness.ts) | `VisionCamera.createDeviceFactory`, device enumeration, per-device capabilities, `getCameraForId`, `addOnCameraDevicesChangedListener`, `getSupportedExtensions`, `userPreferredCamera` |
| [visioncamera.permissions.harness.ts](visioncamera.permissions.harness.ts) | `VisionCamera.requestCameraPermission` / `requestMicrophonePermission`, including requests that overlap |
| [visioncamera.session.harness.ts](visioncamera.session.harness.ts) | `createCameraSession`, `configure`, `start`, `stop`, `addOnStartedListener` / `addOnStoppedListener` / `addOnErrorListener` / interruption listeners, reconfigure-while-running, multi-cam |
| [visioncamera.photo.harness.ts](visioncamera.photo.harness.ts) | `createPhotoOutput`, `capturePhoto` / `capturePhotoToFile`, container formats (JPEG, HEIC, DNG), flash / mirror / quality / resolution options, capture lifecycle callbacks, preview images |
| [visioncamera.video.harness.ts](visioncamera.video.harness.ts) | `createVideoOutput`, `Recorder` lifecycle, audio, `maxDuration` / `maxFileSize` stops, pause / resume / cancel, persistent recorder, higher-resolution codecs |
| [visioncamera.frame.harness.ts](visioncamera.frame.harness.ts) | `createFrameOutput`, worklet install via `react-native-vision-camera-worklets`, YUV / RGB / native pixel formats, `scheduleOnRN`, `createSynchronizable`, `setOnFrameDroppedCallback`, `enablePreviewSizedOutputBuffers` |
| [visioncamera.multi-output.harness.ts](visioncamera.multi-output.harness.ts) | Multi-output sessions that combine photo, video, and frame outputs, output replacement while other outputs stay attached, persistent recording across session restarts |
| [visioncamera.constraints.harness.ts](visioncamera.constraints.harness.ts) | `VisionCamera.resolveConstraints` + `onSessionConfigSelected`, FPS / HDR / stabilization / binned / pixelFormat / resolutionBias constraints |
| [visioncamera.controller.harness.ts](visioncamera.controller.harness.ts) | `CameraController` — zoom, torch, exposure bias, focus metering, low-light boost, subject area listener |
| [visioncamera.hooks.harness.tsx](visioncamera.hooks.harness.tsx) | React hook reactivity for `useCameraDevice(...)` position and physical-device filter changes, and `useCamera(...).onUIRotationChanged` |
| [visioncamera.utils.harness.ts](visioncamera.utils.harness.ts) | Pure public utilities such as `getUIRotation(...)` across every output/interface orientation pair |
| [visioncamera.coordinates.harness.ts](visioncamera.coordinates.harness.ts) | `Frame.convertFramePointToCameraPoint` / `convertCameraPointToFramePoint`, `PreviewView.convertViewPointToCameraPoint` / `convertCameraPointToViewPoint`, `PreviewView.createMeteringPoint`, `convertScannedObjectCoordinatesToViewCoordinates`, end-to-end Frame → Camera → View round-trip |
| [visioncamera.nativepreviewview.harness.tsx](visioncamera.nativepreviewview.harness.tsx) | Bare `NativePreviewView` lifecycle, layout-sensitive preview regression coverage, `resizeMode`, Android `implementationMode`, gesture controllers, multi-preview mounting, `PreviewView` ref methods, Android `takeSnapshot()` dimensions |
| [visioncamera.camera-view.harness.tsx](visioncamera.camera-view.harness.tsx) | High-level `<Camera>` preview lifecycle, photo output integration, controller props, native gestures, `CameraRef` methods, `isActive`, mount / unmount / replacement behavior |

Pick the file that best matches what you're testing. If you're reproducing a bug that spans multiple outputs, put it in the file most central to the failure. If nothing fits, open a new `visioncamera.<domain>.harness.ts` — Jest picks up anything matching `__tests__/**/*.harness.{ts,tsx}`.

## How a test is written

The contract is deliberately strict so that the tests read exactly like VisionCamera user code — contributors and LLMs should be able to drop in a reproduction without having to learn framework-specific helpers.

### 1. Use the `VisionCamera` API as-is. **No helpers.**

Every test builds up its session inline, end-to-end, from `VisionCamera` up. Do **not** extract helpers like `createSession()` or `configureAndStart()` — the API should read in tests exactly as users would write it in their app.

```ts
it('captures a JPEG Photo in-memory', async () => {
  const session = await VisionCamera.createCameraSession(false)
  const photoOutput = VisionCamera.createPhotoOutput({
    targetResolution: CommonResolutions.FHD_4_3,
    containerFormat: 'jpeg',
    quality: 0.9,
    qualityPrioritization: 'balanced',
  })
  await session.configure([
    {
      input: backDevice,
      outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
      constraints: [],
    },
  ])
  await session.start()

  const photo = await photoOutput.capturePhoto(
    { flashMode: 'off', enableShutterSound: false },
    {},
  )
  expect(photo.width).toBeGreaterThan(0)
  expect(photo.containerFormat).toBe('jpeg')
  photo.dispose()

  await session.stop()
})
```

**`beforeAll` may cache trivial API results** (e.g. the `CameraDeviceFactory` and the default back / front `CameraDevice`). It must not wrap any camera session setup — every `it` block gets its own `session`, `photoOutput`, etc. to run as atomically as possible.
Each atomic test must tear down any non-trivial objects properly to avoid leaking hardware state between tests - most importantly, you must always `stop()` (or even `dispose()`) a `CameraSession`.

### 2. Hard vs. soft requirements

Cameras differ. A failing hard requirement is a real bug; a missing soft feature is a device limitation and should not fail the test.

- **Hard requirement** — checked with `expect(...)`, makes the test fail. Examples: a back camera exists; a photo output produces a photo with `width > 0`; `session.configure` returns one controller per connection, or an API contract holds up to it's promise.
- **Soft requirement** — gated by the matching capability flag and `context.skip('<what>: <reason>')` when not supported. Harness reports this as a real skipped test with the reason in the run summary and JUnit output, so do not use `console.log(...)` plus `return` for runtime camera capability gaps.

```ts
it('resolves photoHDR: true when the device supports photo HDR', async (context) => {
  if (!backDevice.supportsPhotoHDR) {
    return context.skip('photoHDR: not supported on this device')
  }
  // hard-assert HDR behavior from here on
})
```

Use the guard form above instead of `context.skip(condition, reason)` when a nullable value needs to be narrowed afterwards. Keep the `return` so TypeScript understands the rest of the test only runs when the capability exists. If only one optional case inside a matrix is unsupported, split that case into its own `it(...)` so the always-supported cases still run and the optional case is reported as skipped.

Only call `context.skip(...)` from the `it(...)` body or code that intentionally skips that whole test. Do not hide it inside a shared helper for optional sub-assertions, because it aborts the entire `it(...)`. If a cross-platform test has an Android-only or iOS-only assertion, split that behavior into a dedicated `it(...)` with its own platform skip.

Capability flags live on
- `CameraDevice` (`hasFlash`, `hasTorch`, `supportsFocusMetering`, `supportsExposureBias`, `supportsPhotoHDR`, `supportsFPS(n)`, `supportsVideoStabilizationMode('cinematic')`, etc.),
- `CameraController` (`minISO`, `maxISO`, `minExposureDuration`, etc.) and on
- `VisionCamera` (`supportsMultiCamSessions`)

Use them. Do **not** introduce ad-hoc try/catch wrappers around an operation just to silently skip it — if there is no way to query support upfront, flag that as a missing API (see "Known API gaps" below) and `it.skip` the test with a TODO explaining what would let you turn it into a hard requirement.

### 3. Test behavior, not types

Nitrogen and TypeScript enforce types at compile time and Nitro Modules enforce them at the bridge. Type-shape assertions like `typeof x === 'number'` or `Array.isArray(devices)` are pure noise — if a number came back as a string, the bridge would have already thrown.

Assert things that require the camera to actually do work:

- **The operation completes without throwing** on the happy path — `await session.configure(...)`, `await photoOutput.capturePhoto(...)`, `await recorder.stop()` returning at all is a meaningful assertion.
- **The operation throws when it should** on the false path — e.g. calling `session.start()` before `configure()`, capturing from a disposed output, requesting an unsupported `targetResolution`. Use `await expect(...).rejects.toThrow()`.
- **The result has the right semantic value**, not the right type — a captured `Photo` has `width > 0` and `height > 0`, a video file's size on disk is `> 0`, the returned controller list has `length === connections.length`.
- **API contracts between fields hold** — e.g. if `device.hasFlash` is false then `capturePhoto({ flashMode: 'on' })` must reject; if a connection has `mirrorMode: 'auto'`, the resulting `Photo.isMirrored` reflects the device's front/back position. These cross-field invariants are exactly what types can't catch and what real bugs ship as.
- **Approximate numeric values use matcher tolerances** — for coordinates, dimensions, timestamps, or similar floating-point values, prefer `expect(actual).toBeCloseTo(expected, digits)` over manual `Math.abs(actual - expected)` assertions. The matcher is shorter, keeps the expected value visible in failures, and matches the style used throughout the coordinate tests.
- **Lifecycle and listeners fire in the right order** — `addOnStartedListener` resolves after `start()`, `addOnStoppedListener` after `stop()`, recording callbacks after `recorder.stop()`. Wait on the listener, don't poll `isRunning`.

If your test would still pass with the implementation stubbed to `throw new Error('TODO')`, you're testing the type system, not the camera.

### 4. Prefer callbacks over polled state

`session.isRunning` updates asynchronously on Android. Wait for `session.addOnStartedListener(...)` and `addOnStoppedListener(...)` using `waitUntil(() => started, { timeout: 10_000 })` instead of polling `isRunning` in a sleep loop.

### 5. Don't silently swallow errors

No `.catch(() => undefined)` or `try {} catch {}` around otherwise-expected-to-succeed calls. If `session.stop()` can throw, the test should fail — that's a regression.
If something 100% throws for now, it's a missing feature/regression and we should still add a test for it - either `it(...)` or `it.skip(...)` depending on context. This is like a TODO list then, so we make the test green at some point in the near future.

### 6. Dispose only when it matters

`Photo`, `Frame`, and `Image` hold large native buffers — call `.dispose()` as soon as you're done with them. You do **not** need to dispose `CameraDevice`, `CameraController`, or outputs in tests; the JS runtime GC _usually_ frees them between tests.
Disposing HybridObjects in JS makes the object no longer usable - any subsequent call to it _will throw_. So only dispose if absolutely necessary or if holding on to large native memory (e.g. `Photo`, `Frame`, `Image`, ...).

### 7. No artificial `setTimeout` delays

Tests must only wait on events they actually depend on (`session.addOnStartedListener`, `onRecordingFinished`, a frame counter, a `CompletableDeferred`). Sleeping a random number of milliseconds "so the camera settles" introduces flakiness and masks real regressions. If you catch yourself writing `await sleep(500)` to "make it work", treat it as a bug to fix, not a patch to keep.

The exception is when elapsed wall-clock time is part of the behavior under test. Video recording tests may sleep briefly after `startRecording()` because they intentionally need the recorder to produce a non-empty clip, collect stats, exercise pause/resume over time, or observe that `cancelRecording()` does not later emit `onRecordingFinished`. Keep those sleeps short, local to the recording phase, and make the reason obvious from the surrounding test. Do not use sleeps to wait for session, preview, frame, or listener lifecycle state.

### 8. Platform guards

Pure iOS-only features (`CameraObjectOutput`, `continuity camera`, `getSupportedVideoCodecs`, etc.) or Android-only features (`CameraExtension`, etc.) should start with a `return context.skip('...: iOS only')` / `return context.skip('...: Android only')` platform guard. Do not branch on `Platform.OS` to mask behavioral differences that should be identical across platforms — flag those as bugs.
If a behavior should be supported on both platforms, write one shared test. If that makes CI red on one platform, keep the failure visible until the platform discrepancy is fixed.
Harness tests should cover the broadest behavior the public API promises. A bug report coming from one native stack (for example an AVFoundation assertion or a CameraX exception) is not a reason to make the regression test platform-specific if the user-facing behavior should work everywhere. Do not add platform guards just to make a test narrower, faster, or closer to the original report. There is no upside: it only hides regressions on the other platform. When in doubt, run the shared behavior on all Harness platforms and let CI show any real platform discrepancy.
Do not guard features that expose runtime availability checks behind such flags - e.g. `setFocusLocked(...)` can be probed with `device.supportsManualFocus` - even if this natively is always `false` on Android, this allows us to automatically run the test in the future once we add focus locking support to Android too.
Also do not guard features that are technically possible to implement on the other platform, but not yet implemented due to a TODO behind such feature flags. `setFocusLocked` would be such a case. In these situations, it's expected to have the test red on the missing platform until it's implemented - kinda like a task list for the maintainers.
Platform guards only apply to statically for sure known platform-specific behaviour, like the `CameraObjectOutput` on iOS or `CameraExtension` on Android.

### 9. Keep assertions compact and diagnostic

Tests should read like a small executable spec for one behavior. A few patterns keep them simpler without making them weaker:

- **Name the invariant, not the implementation detail.** Prefer local names like `expectedBounds`, `reportedBounds`, `roundTripped`, or `capturedPhoto` over names that describe temporary mechanics.
- **Use matcher assertions instead of boolean arithmetic.** Prefer `toBeCloseTo`, `toHaveLength`, `toContain`, `toEqual`, and `rejects.toThrow` over manually computing booleans inline and asserting on those - this makes it easier to read tests, especially when they fail in CI outputs. This is especially important for Harness/Vitest logs from AWS Device Farm: rich matchers preserve the received and expected values, while aggregate checks such as max/min deltas usually only show the derived number.
- **Loop over repeated dimensions or cases.** For edges, axes, formats, or corner points, a tiny inline array plus one expectation is clearer than four copy-pasted assertions that can drift.
- **Keep local math behind local names.** Small functions inside an `it` block are fine when they name a one-off transform or assertion, such as `getBounds(...)`. Do not put arithmetic, boolean expressions, `map(...)`, or other transformations directly inside `expect(...)`; assign them to descriptive local names first. Do not collapse multiple facts into one computed assertion like `expect(a + b).toBeGreaterThan(0)` — assert `a` and `b` separately so CI failures identify the broken value. Do not extract shared setup helpers; the camera session still needs to be built inline.
- **Keep Harness output quiet.** Do not add `console.log` calls to tests. Use focused matcher assertions so failures report the relevant received and expected values.

## Running the tests

```sh
# Build the debug APK once
cd apps/simple-camera && bun run build:android

# Install + grant camera / microphone / location permissions
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
BUNDLE_ID=com.margelo.nitro.camera.example.simple
adb shell pm grant $BUNDLE_ID android.permission.CAMERA
adb shell pm grant $BUNDLE_ID android.permission.RECORD_AUDIO
adb shell pm grant $BUNDLE_ID android.permission.ACCESS_FINE_LOCATION
adb shell pm grant $BUNDLE_ID android.permission.ACCESS_COARSE_LOCATION

# Run the full harness suite against the connected device
HARNESS_ANDROID_DEVICE_MANUFACTURER=<manufacturer> \
HARNESS_ANDROID_DEVICE_MODEL=<model> \
bun run test:harness:android

# Or just one file
HARNESS_ANDROID_DEVICE_MANUFACTURER=<manufacturer> \
HARNESS_ANDROID_DEVICE_MODEL=<model> \
bun run test:harness:android -- --testPathPatterns=photo
```

`HARNESS_ANDROID_DEVICE_MANUFACTURER` / `HARNESS_ANDROID_DEVICE_MODEL` come from `adb shell getprop ro.product.manufacturer` / `ro.product.model`. On AWS Device Farm they're set automatically by the workflow.

Permissions are granted once per install. If you reinstall the APK with `adb install -r`, re-run the `pm grant` lines before the next test run — otherwise the first test's `expect(cameraPermissionStatus).toBe('authorized')` will fail.

The `.harness/` folder is auto-generated by the harness bundler and is gitignored. You can safely delete it.

## Known API gaps / currently-skipped tests

A few tests are authored but `it.skip`'d because the VisionCamera API doesn't yet expose the precondition they need. Each skip has a `TODO` in the file pointing at what needs to land first. Today:

- **Photo container format support** — HEIC and DNG capture work on some devices and fail on others, but there is no `CameraDevice.supportedPhotoContainerFormats` today. These tests are `it.skip` with a TODO until the API lands. Once it exists the tests become soft-requirements gated on the flag.
- **`initialZoom` / `initialExposureBias` on Android** — `applyInitialConfig` runs at `configure()` time, before CameraX's LifecycleOwner reaches STARTED. `CameraControl.setExposureCompensationIndex` silently fails in that state. The corresponding tests are `it.skip` until the initial config application happens at a point where CameraX accepts it.
- **`enablePreviewSizedOutputBuffers` on Android** — the flag is not honored by `HybridFrameOutput.kt` today (`TODO: enablePreviewSizedOutputBuffers is not taken into account here.`).
- **`onFrameDropped` on Android** — `HybridFrameOutput.setOnFrameDroppedCallback` is a no-op (`TODO: CameraX does not have a way to figure out if a Frame has been dropped or not.`).

If you hit another case where you can't write a test because an API is missing, add the test with `it.skip` and a TODO explaining the precondition — that way when the API lands we already know which tests to flip back on.

## CI

Harness tests run on every push and PR that touches this folder, the VisionCamera library, or the harness workflow config — see [.github/workflows/harness-aws-device.yml](../../../.github/workflows/harness-aws-device.yml) and [.github/workflows/harness-android-emulator.yml](../../../.github/workflows/harness-android-emulator.yml).

The AWS Device Farm run is the source of truth: it's a real phone, a real SoC, a real camera pipeline. The emulator run is best-effort and may skip hardware-dependent tests.

If your PR fails CI, the fastest way to debug is:

1. Download the `harness output log` artifact from the failed workflow run. It contains the full JS console output per test.
2. Inspect the Harness/JUnit skipped-test summary to see which soft requirements were skipped — the skip reason tells you what your test device lacks.
3. Grep for `FAIL` to see which `it` blocks failed and their stack traces.
4. Open the JUnit XML artifact in your IDE's JUnit viewer for a structured summary.

Ideally, run the Harness tests on a real phone and stream native logs (`adb logcat` on Android) to understand certain failures, or possibly native crashes.

## High-level components / hooks (`<Camera>`, `useCamera()`, etc.)

High-level component tests live alongside the imperative suites when the API surface is React rendering, layout, or component convenience behavior. Keep them focused: render the smallest component tree that reproduces the behavior, wait on real lifecycle events, and assert through the public ref or callbacks.

Detailed preview rendering, layout, snapshot, resize-mode, and implementation-mode coverage belongs in `visioncamera.nativepreviewview.harness.tsx`. `visioncamera.camera-view.harness.tsx` should stay focused on the high-level `<Camera>` wrapper: `isActive`, lifecycle callbacks, ref exposure, output wiring, high-level gesture props, and React mount/unmount behavior.

The goal is to have the imperative API tests cover everything, and the high-level components tests should just cover their abstractions or base features (which under the hood use the same imperative API) - but not repeat the whole tests from the imperative API again.
For example; we don't need to test if a `CameraVideoOutput` properly stops recording once `maxFileSize` is reached both the imperative API tests, as well as in the `<Camera>`/`useCamera()` high-level APIs. Instead, only do such specific tests in the imperative API tests (as this is much more narrow and is easier to debug in CI), and keep high-level tests _high-level_ - e.g. ensuring the Camera can start, ensuring React lifecycle/unmounting/remounting works, ensuring `<Camera>` renders properly, ensuring it tears the session down and starts again when rendering a new one, ensuring `isActive` works, ensuring it attaches outputs when the `outputs={[...]}` array updates, testing the `ref` methods, etc etc.

For layout regressions, prefer geometry and native ref assertions over golden screenshots. Device Farm camera feeds are not stable visual fixtures.
Camera sensors in AWS Device Farm are often covered with tape, so they do not show bright visual content, but it's not fully black either - it's kinda greyish with noise, or sometimes also looks red-ish as if a thumb covers the camera. If you do visual tests, ensure it's not full black or full white or any other full color - Camera preview should be some noise between white and black. This helps separate actual Camera stream from just black or white background views in React, or `resizeMode="contain"` fill/padding.

Mounting native Hybrid views to exercise their ref methods is still allowed. Some imperative APIs (e.g. `PreviewView.convertViewPointToCameraPoint`, `PreviewView.createMeteringPoint`) can only be reached through a mounted, laid-out view. Those tests may `render(<NativePreviewView ... />)` from `react-native-harness`, capture the ref via `hybridRef`, and call the methods directly — see [visioncamera.nativepreviewview.harness.tsx](visioncamera.nativepreviewview.harness.tsx) and [visioncamera.coordinates.harness.ts](visioncamera.coordinates.harness.ts) for the imperative pattern.
