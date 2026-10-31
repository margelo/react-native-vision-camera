# Third-party code in this app

## iOS — AVFoundation fake (`ios/FakeSimulatedCamera/FakeCamera/*`)

Own implementation. The runtime technique (swizzling `AVCaptureDevice` discovery / `AVCaptureSession` and vending `AVCaptureDevice` / `AVCaptureDevice.Format` subclasses created with `class_createInstance`) is the one used by [serve-sim](https://github.com/EvanBacon/serve-sim) `SimCameraInjector` (Apache-2.0) and [FauxCam](https://github.com/mkemalgokce/fauxcam) `Guest/` (MIT). No code is copied from either; only the approach is shared.

## Android — vendored CameraX test fakes

Pinned fork of the AOSP CameraX test fakes, from `platform/frameworks/support` commit **`bb117e26ce89b888d6f928ff7b604913a1da43f2`** (the tip of the `1.7.0-alpha03` release range for `camera-core` / `camera-camera2`, matching the `camerax_version` this repo uses). Apache-2.0; the upstream license header is kept verbatim at the top of every vendored file (an explicit exception to this repo's one-line-comment rule — our own code follows it). Bumping `camerax_version` means re-syncing these files from the matching commit.

| File | Upstream path (under `camera/camera-testing/src/main/java/`) | Modification |
|---|---|---|
| `androidx/camera/testing/fakes/FakeCamera.java` | `androidx/camera/testing/fakes/FakeCamera.java` | Dropped `simulateCaptureFrameAsync` (pulled in image-capture test helpers); no other change. |
| `androidx/camera/testing/fakes/FakeCameraInfoInternal.java` | same | Rewritten to drop the `androidx.test`/`CameraManager` dependency, add catalog setters (frame-rate ranges, flash unit, sensor rect, resolutions per format), and implement `UnsafeWrapper` so VisionCamera's Camera2 interop resolves the catalog camera id. |
| `androidx/camera/testing/fakes/FakeCameraControl.kt` | `.../fakes/FakeCameraControl.java` | Reimplemented as a no-op control (upstream dragged in `androidx.camera.testing.imagecapture.*`). |
| `androidx/camera/testing/impl/fakes/FakeCameraCoordinator.java` | `androidx/camera/testing/impl/fakes/FakeCameraCoordinator.java` | Unchanged. |
| `androidx/camera/testing/impl/fakes/FakeCameraDeviceSurfaceManager.java` | same | `Ints.asList` (Guava) → `Arrays.asList`. |
| `androidx/camera/testing/impl/fakes/FakeEncoderProfilesProvider.java` | same | Unchanged. |
| `androidx/camera/testing/impl/fakes/FakeSessionConfigOptionUnpacker.kt` | same | Unchanged. |
| `androidx/camera/testing/impl/fakes/FakeUseCaseConfigFactory.kt` | `.../fakes/FakeUseCaseConfigFactory.java` | Reimplemented without the `TakePictureManager` test wrapper. |

Upstream `FakeCameraFactory` and `FakeAppConfig` are not vendored; `com/margelo/nitro/camera/example/fake/camerax/CatalogCameraFactory.kt` replaces them.

The `com/margelo/nitro/camera/example/fake/**` package (catalog parsing, `CameraXConfig.Provider` wiring, the `Camera2CameraInfo` / `CameraProperties` / `CameraMetadata` interop bridge) is our own code.
