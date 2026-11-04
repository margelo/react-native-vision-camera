import { assert, beforeAll, describe, expect, it } from 'react-native-harness'
import type {
  CameraDeviceFactory,
  TargetCameraPosition,
} from 'react-native-vision-camera'
import { VisionCamera } from 'react-native-vision-camera'

describe('VisionCamera - Devices', () => {
  let factory: CameraDeviceFactory

  beforeAll(async () => {
    expect(VisionCamera.cameraPermissionStatus).toBe('authorized')
    factory = await VisionCamera.createDeviceFactory()
  })

  it('enumerates at least one back and one front camera', () => {
    const back = factory.getDefaultCamera('back')
    const front = factory.getDefaultCamera('front')
    expect(back).toBeDefined()
    expect(front).toBeDefined()

    const cameraPositions = factory.cameraDevices.map((d) => d.position)
    expect(cameraPositions).toContain('back')
    expect(cameraPositions).toContain('front')
  })

  it('returns the default camera for each available target position', () => {
    const positions: TargetCameraPosition[] = ['back', 'front', 'external']

    for (const position of positions) {
      const defaultCamera = factory.getDefaultCamera(position)
      const devicesAtPosition = factory.cameraDevices.filter(
        (d) => d.position === position,
      )

      if (devicesAtPosition.length === 0) {
        expect(defaultCamera).toBeUndefined()
        continue
      }

      assert.exists(defaultCamera, `no default camera for ${position}`)
      expect(defaultCamera.position).toBe(position)
      const deviceIdsAtPosition = devicesAtPosition.map((d) => d.id)
      expect(deviceIdsAtPosition).toContain(defaultCamera.id)
    }
  })

  it('returns the same device when calling getCameraForId with a known id', () => {
    const first = factory.cameraDevices[0]
    assert.exists(first, 'no cameras')

    const looked = factory.getCameraForId(first.id)
    assert.exists(looked, `camera not found for id ${first.id}`)
    expect(looked.id).toBe(first.id)
  })

  it('returns undefined when calling getCameraForId with an unknown id', () => {
    const looked = factory.getCameraForId(
      `definitely-not-a-real-camera-id-${Date.now()}`,
    )
    expect(looked).toBeUndefined()
  })

  it('returns an array from getSupportedExtensions for the default back camera', async () => {
    const device = factory.getDefaultCamera('back')
    assert.exists(device, 'no back camera')
    const extensions = await factory.getSupportedExtensions(device)
    expect(extensions).toBeInstanceOf(Array)
  })

  it('subscribes and unsubscribes a devices-changed listener', () => {
    const subscription = factory.addOnCameraDevicesChangedListener(() => {})
    subscription.remove()
    subscription.remove()
  })

  it('does not expose unknown fallback values in enumerated device capabilities', () => {
    for (const device of factory.cameraDevices) {
      for (const inspectedDevice of [device, ...device.physicalDevices]) {
        expect(inspectedDevice.position).not.toBe('unspecified')
        expect(inspectedDevice.type).not.toBe('unknown')
        expect(inspectedDevice.mediaTypes).not.toContain('other')
        expect(inspectedDevice.supportedPixelFormats).not.toContain('unknown')

        for (const dynamicRange of inspectedDevice.supportedVideoDynamicRanges) {
          expect(dynamicRange.bitDepth).not.toBe('unknown')
          expect(dynamicRange.colorSpace).not.toBe('unknown')
          expect(dynamicRange.colorRange).not.toBe('unknown')
        }
      }
    }
  })

  it('reports sane capability invariants for each device', () => {
    for (const device of factory.cameraDevices) {
      expect(device.minZoom).toBeLessThanOrEqual(device.maxZoom)
      expect(device.neutralZoom).toBeGreaterThanOrEqual(device.minZoom)
      expect(device.neutralZoom).toBeLessThanOrEqual(device.maxZoom)

      if (device.supportsExposureBias) {
        expect(device.minExposureBias).toBeLessThanOrEqual(
          device.maxExposureBias,
        )
      }

      if (device.mediaTypes.includes('video')) {
        expect(device.supportedPixelFormats).not.toHaveLength(0)
        expect(device.supportedFPSRanges).not.toHaveLength(0)
        for (const range of device.supportedFPSRanges) {
          expect(range.min).toBeLessThanOrEqual(range.max)
        }
      }
    }
  })

  it('returns non-empty getSupportedResolutions for photo/video streams on a back device', () => {
    const device = factory.getDefaultCamera('back')
    assert.exists(device, 'no back camera')
    const photoResolutions = device.getSupportedResolutions('photo')
    const videoResolutions = device.getSupportedResolutions('video')
    expect(photoResolutions).not.toHaveLength(0)
    expect(videoResolutions).not.toHaveLength(0)
  })

  it('gets and sets userPreferredCamera', (context) => {
    const back = factory.getDefaultCamera('back')
    assert.exists(back, 'no back camera')
    const previous = factory.userPreferredCamera
    context.onTestFinished(() => {
      factory.userPreferredCamera = previous
    })
    factory.userPreferredCamera = back
    expect(factory.userPreferredCamera?.id).toBe(back.id)
  })

  it('exposes supportedMultiCamDeviceCombinations consistently with supportsMultiCamSessions', () => {
    if (VisionCamera.supportsMultiCamSessions) {
      expect(factory.supportedMultiCamDeviceCombinations).not.toHaveLength(0)
    } else {
      expect(factory.supportedMultiCamDeviceCombinations).toHaveLength(0)
    }
  })

  it('every device in a supportedMultiCamDeviceCombinations combination is also present in cameraDevices', (context) => {
    const combinations = factory.supportedMultiCamDeviceCombinations
    if (combinations.length === 0) {
      return context.skip(
        'supportedMultiCamDeviceCombinations device lookup: no combinations on this platform',
      )
    }
    const knownIds = factory.cameraDevices.map((d) => d.id)
    for (const combination of combinations) {
      expect(combination).not.toHaveLength(0)
      for (const device of combination) {
        expect(knownIds).toContain(device.id)
      }
    }
  })
})
