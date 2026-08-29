import {
  androidEmulator,
  androidPlatform,
  physicalAndroidDevice,
} from '@react-native-harness/platform-android'
import {
  applePhysicalDevice,
  applePlatform,
  appleSimulator,
} from '@react-native-harness/platform-apple'

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
  'com.margelo.nitro.camera.example.simple'
const androidPhysicalManufacturer =
  process.env.HARNESS_ANDROID_DEVICE_MANUFACTURER ?? 'Pixel'
const androidPhysicalModel = process.env.HARNESS_ANDROID_DEVICE_MODEL ?? 'Pro 7'
const androidDeviceMode =
  process.env.HARNESS_ANDROID_DEVICE_MODE?.trim().toLowerCase() ?? 'physical'

const iosBundleId =
  process.env.HARNESS_IOS_BUNDLE_ID ?? 'com.margelo.nitro.camera.example.simple'
const iosSimulatorName = process.env.HARNESS_IOS_SIMULATOR ?? 'iPhone 16 Pro'
const iosSimulatorVersion = process.env.HARNESS_IOS_SIMULATOR_VERSION ?? '18.5'
const iosPhysicalDeviceIdentifier =
  process.env.HARNESS_IOS_DEVICE_ID?.trim() || 'iPhone'
const iosDeviceMode = process.env.HARNESS_IOS_DEVICE_MODE?.trim().toLowerCase()
const iosMetroHostInput = process.env.HARNESS_IOS_METRO_HOST?.trim() ?? ''
const iosMetroPort = process.env.HARNESS_IOS_METRO_PORT ?? '8081'

const formatIosMetroHostPort = (input, port) => {
  if (input === '') {
    return ''
  }

  const bracketedIpv6Match = input.match(/^\[([^\]]+)\](?::(\d+))?$/)
  if (bracketedIpv6Match != null) {
    const [, host, explicitPort] = bracketedIpv6Match
    return explicitPort == null ? `[${host}]:${port}` : input
  }

  const colonCount = [...input].filter((char) => char === ':').length
  if (colonCount > 1) {
    return `[${input}]:${port}`
  }

  return input.includes(':') ? input : `${input}:${port}`
}

const iosMetroHostPort = formatIosMetroHostPort(iosMetroHostInput, iosMetroPort)
const metroBindHost = process.env.HARNESS_METRO_BIND_HOST?.trim() ?? ''
const iosAppLaunchOptions = iosMetroHostPort
  ? {
      arguments: [
        '-RCT_jsLocation',
        iosMetroHostPort,
        '-RCT_packager_scheme',
        'http',
      ],
    }
  : undefined

const isCI = process.env.CI === 'true'
const bundleStartTimeout = isCI ? 90_000 : 15_000
const bridgeTimeout = isCI ? 120_000 : 45_000
const maxAppRestarts = isCI ? 4 : 2

const useEmulator = androidDeviceMode === 'emulator'

const androidDevice = useEmulator
  ? androidEmulator(androidEmulatorName, {
      apiLevel: androidApiLevel,
      profile: androidDeviceProfile,
      diskSize: androidDiskSize,
      heapSize: androidHeapSize,
    })
  : physicalAndroidDevice(androidPhysicalManufacturer, androidPhysicalModel)

const useIosSimulator =
  iosDeviceMode === 'simulator' || (iosDeviceMode == null && !isCI)

const iosDevice = useIosSimulator
  ? appleSimulator(iosSimulatorName, iosSimulatorVersion)
  : applePhysicalDevice(iosPhysicalDeviceIdentifier, {
      codeSign: {
        teamId: 'TheTeamHereDoesntMatterOnCiButWeHaveToPassItStillIthink',
      },
    })

const config = {
  entryPoint: './index.js',
  appRegistryComponentName: 'SimpleCamera',
  host: metroBindHost === '' ? undefined : metroBindHost,
  runners: [
    androidPlatform({
      name: 'android',
      device: androidDevice,
      bundleId: androidBundleId,
    }),
    applePlatform({
      name: 'ios',
      device: iosDevice,
      bundleId: iosBundleId,
      appLaunchOptions: iosAppLaunchOptions,
    }),
  ],
  defaultRunner: 'android',
  bridgeTimeout,
  bundleStartTimeout,
  maxAppRestarts,
  detectNativeCrashes: true,
  resetEnvironmentBetweenTestFiles: true,
  forwardClientLogs: true,
  permissions: true,
}

export default config
