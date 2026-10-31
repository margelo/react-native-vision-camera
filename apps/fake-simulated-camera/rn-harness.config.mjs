import {
  androidEmulator,
  androidPlatform,
  physicalAndroidDevice,
} from '@react-native-harness/platform-android'
import {
  applePlatform,
  appleSimulator,
} from '@react-native-harness/platform-apple'

// Name of the natively-authored catalog the app injects on launch (see FakeCameraCatalog.m / .kt).
const fakeCameraCatalog = process.env.FAKE_CAMERA_CATALOG ?? 'default'

const androidEmulatorName =
  process.env.HARNESS_ANDROID_EMULATOR ?? 'Pixel_API_35'
const androidApiLevel = Number.parseInt(
  process.env.HARNESS_ANDROID_API_LEVEL ?? '35',
  10,
)
const androidDeviceProfile =
  process.env.HARNESS_ANDROID_DEVICE_PROFILE ?? 'pixel'
const androidDiskSize = process.env.HARNESS_ANDROID_DISK_SIZE ?? '1G'
const androidHeapSize = process.env.HARNESS_ANDROID_HEAP_SIZE ?? '1G'
const androidBundleId =
  process.env.HARNESS_ANDROID_BUNDLE_ID ??
  'com.margelo.nitro.camera.example.fake'
const androidPhysicalManufacturer =
  process.env.HARNESS_ANDROID_DEVICE_MANUFACTURER ?? 'Pixel'
const androidPhysicalModel = process.env.HARNESS_ANDROID_DEVICE_MODEL ?? 'Pro 7'
const androidDeviceMode =
  process.env.HARNESS_ANDROID_DEVICE_MODE?.trim().toLowerCase() ?? 'emulator'

const iosBundleId =
  process.env.HARNESS_IOS_BUNDLE_ID ?? 'com.margelo.nitro.camera.example.fake'
const iosSimulatorName = process.env.HARNESS_IOS_SIMULATOR ?? 'iPhone 17 Pro'
const iosSimulatorVersion = process.env.HARNESS_IOS_SIMULATOR_VERSION ?? '26.5'
const metroBindHost = process.env.HARNESS_METRO_BIND_HOST?.trim() ?? ''

const isCI = process.env.CI === 'true'
const bundleStartTimeout = isCI ? 90_000 : 15_000
const bridgeTimeout = isCI ? 120_000 : 45_000
const maxAppRestarts = isCI ? 4 : 2

const androidDevice =
  androidDeviceMode === 'emulator'
    ? androidEmulator(androidEmulatorName, {
        apiLevel: androidApiLevel,
        profile: androidDeviceProfile,
        diskSize: androidDiskSize,
        heapSize: androidHeapSize,
      })
    : physicalAndroidDevice(androidPhysicalManufacturer, androidPhysicalModel)

const config = {
  entryPoint: './index.js',
  appRegistryComponentName: 'FakeSimulatedCamera',
  host: metroBindHost === '' ? undefined : metroBindHost,
  runners: [
    // Fake catalog injected through CameraX (see android/.../fake).
    androidPlatform({
      name: 'android',
      device: androidDevice,
      bundleId: androidBundleId,
      appLaunchOptions: {
        extras: { fakeCameraCatalog },
      },
    }),
    // Real Camera2 on the emulator's virtual-scene camera (QR poster).
    androidPlatform({
      name: 'android-scene',
      device: androidDevice,
      bundleId: androidBundleId,
      appLaunchOptions: {
        extras: { fakeCameraCatalog: 'off' },
      },
    }),
    // Fake catalog injected through AVFoundation (see ios/FakeSimulatedCamera/FakeCamera).
    applePlatform({
      name: 'ios',
      device: appleSimulator(iosSimulatorName, iosSimulatorVersion),
      bundleId: iosBundleId,
      appLaunchOptions: {
        arguments: ['-FakeCameraCatalog', fakeCameraCatalog],
      },
    }),
  ],
  defaultRunner: 'ios',
  bridgeTimeout,
  bundleStartTimeout,
  maxAppRestarts,
  detectNativeCrashes: true,
  resetEnvironmentBetweenTestFiles: true,
  forwardClientLogs: true,
  permissions: true,
}

export default config
