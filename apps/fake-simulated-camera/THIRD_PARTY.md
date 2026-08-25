# Third-party code in this app

| Where | Origin | License | Notes |
|---|---|---|---|
| `ios/FakeSimulatedCamera/FakeCamera/*` | Technique adapted from [serve-sim](https://github.com/EvanBacon/serve-sim) `SimCameraInjector` and [FauxCam](https://github.com/mkemalgokce/fauxcam) `Guest/` | Apache-2.0 / MIT | Own implementation; no code copied verbatim. |
| `android/app/src/main/java/com/margelo/nitro/camera/example/fake/camerax/*` | AOSP `platform/frameworks/support`, `camera/camera-testing/src/main/java/androidx/camera/testing/{fakes,impl/fakes}` | Apache-2.0 | Pinned fork, see the header of each file for the upstream commit. License headers kept verbatim. |
