import { Platform } from 'react-native'
import { assert, beforeAll, describe, expect, it } from 'react-native-harness'
import type { CameraDeviceFactory } from 'react-native-vision-camera'
import { VisionCamera } from 'react-native-vision-camera'
import catalog from '../cameras/default.json'

// Every expectation below comes from cameras/default.json, the catalog the app injects on launch.
describe('FakeCamera - Devices', () => {
  let factory: CameraDeviceFactory

  beforeAll(async () => {
    await VisionCamera.requestCameraPermission()
    expect(VisionCamera.cameraPermissionStatus).toBe('authorized')
    factory = await VisionCamera.createDeviceFactory()
  })

  it('enumerates exactly the catalog devices in catalog order', () => {
    const enumeratedIds = factory.cameraDevices.map((device) => device.id)
    const catalogIds = catalog.devices.map((device) => device.id)
    expect(enumeratedIds).toEqual(catalogIds)
  })

  it('reports position, type, flash, torch and zoom from the catalog', () => {
    for (const spec of catalog.devices) {
      const device = factory.cameraDevices.find((d) => d.id === spec.id)
      assert.exists(device, `device ${spec.id} is missing`)
      expect(device.position).toBe(spec.position)
      expect(device.type).toBe(spec.type)
      expect(device.hasFlash).toBe(spec.hasFlash)
      expect(device.hasTorch).toBe(spec.hasTorch)
      expect(device.minZoom).toBe(spec.zoom[0])
      expect(device.maxZoom).toBe(spec.zoom[1])
      expect(device.physicalDevices).toHaveLength(0)
      expect(device.isVirtualDevice).toBe(false)
    }
  })

  it('selects the first catalog device of each position as the default camera', () => {
    const back = factory.getDefaultCamera('back')
    const front = factory.getDefaultCamera('front')
    assert.exists(back, 'no default back camera')
    assert.exists(front, 'no default front camera')
    expect(back.id).toBe('fake-back-wide')
    expect(front.id).toBe('fake-front-wide')
    expect(factory.getDefaultCamera('external')).toBeUndefined()
  })

  it('round-trips every catalog id through getCameraForId', () => {
    for (const spec of catalog.devices) {
      const device = factory.getCameraForId(spec.id)
      assert.exists(device, `getCameraForId(${spec.id}) returned nothing`)
      expect(device.id).toBe(spec.id)
    }
    expect(factory.getCameraForId('not-in-the-catalog')).toBeUndefined()
  })

  it('exposes the union of the catalog fps ranges', () => {
    for (const spec of catalog.devices) {
      const device = factory.getCameraForId(spec.id)
      assert.exists(device, `device ${spec.id} is missing`)
      const expectedRanges = [
        ...new Map(
          spec.formats.flatMap((format) =>
            format.fpsRanges.map((range) => [
              `${range[0]}-${range[1]}`,
              { min: range[0], max: range[1] },
            ]),
          ),
        ).values(),
      ]
      expect(device.supportedFPSRanges).toHaveLength(expectedRanges.length)
      expect(device.supportedFPSRanges).toEqual(
        expect.arrayContaining(expectedRanges),
      )
    }
  })

  it('answers supportsFPS from the catalog fps ranges', () => {
    const backWide = factory.getCameraForId('fake-back-wide')
    const ultraWide = factory.getCameraForId('fake-back-ultra-wide')
    const front = factory.getCameraForId('fake-front-wide')
    assert.exists(backWide, 'fake-back-wide is missing')
    assert.exists(ultraWide, 'fake-back-ultra-wide is missing')
    assert.exists(front, 'fake-front-wide is missing')
    expect(backWide.supportsFPS(60)).toBe(true)
    expect(backWide.supportsFPS(240)).toBe(true)
    expect(backWide.supportsFPS(241)).toBe(false)
    expect(ultraWide.supportsFPS(30)).toBe(true)
    expect(ultraWide.supportsFPS(60)).toBe(false)
    expect(front.supportsFPS(60)).toBe(true)
    expect(front.supportsFPS(120)).toBe(false)
  })

  it('reports HDR video dynamic ranges only for the HDR catalog device', () => {
    const backWide = factory.getCameraForId('fake-back-wide')
    const front = factory.getCameraForId('fake-front-wide')
    assert.exists(backWide, 'fake-back-wide is missing')
    assert.exists(front, 'fake-front-wide is missing')
    const backWideBitDepths = backWide.supportedVideoDynamicRanges.map(
      (range) => range.bitDepth,
    )
    const frontBitDepths = front.supportedVideoDynamicRanges.map(
      (range) => range.bitDepth,
    )
    expect(backWideBitDepths).toContain('hdr-10-bit')
    expect(backWideBitDepths).toContain('sdr-8-bit')
    expect(frontBitDepths).not.toContain('hdr-10-bit')
  })

  it('reports cinematic stabilization from the catalog formats', async (context) => {
    if (Platform.OS !== 'ios') {
      return context.skip('cinematic stabilization: iOS only')
    }
    const backWide = factory.getCameraForId('fake-back-wide')
    const front = factory.getCameraForId('fake-front-wide')
    assert.exists(backWide, 'fake-back-wide is missing')
    assert.exists(front, 'fake-front-wide is missing')
    expect(backWide.supportsVideoStabilizationMode('cinematic')).toBe(true)
    expect(backWide.supportsVideoStabilizationMode('standard')).toBe(true)
    expect(front.supportsVideoStabilizationMode('standard')).toBe(true)
    expect(front.supportsVideoStabilizationMode('cinematic')).toBe(false)
  })

  it('reports standard stabilization through CameraX and never cinematic', async (context) => {
    if (Platform.OS !== 'android') {
      return context.skip('CameraX stabilization: Android only')
    }
    const backWide = factory.getCameraForId('fake-back-wide')
    const ultraWide = factory.getCameraForId('fake-back-ultra-wide')
    assert.exists(backWide, 'fake-back-wide is missing')
    assert.exists(ultraWide, 'fake-back-ultra-wide is missing')
    expect(backWide.supportsVideoStabilizationMode('standard')).toBe(true)
    expect(backWide.supportsVideoStabilizationMode('cinematic')).toBe(false)
    expect(ultraWide.supportsVideoStabilizationMode('standard')).toBe(false)
  })

  it('lists the catalog video resolutions and pixel formats', async (context) => {
    if (Platform.OS !== 'ios') {
      return context.skip('AVCaptureDevice.Format resolutions: iOS only')
    }
    for (const spec of catalog.devices) {
      const device = factory.getCameraForId(spec.id)
      assert.exists(device, `device ${spec.id} is missing`)
      const expectedResolutions = [
        ...new Map(
          spec.formats.map((format) => [
            `${format.width}x${format.height}`,
            { width: format.width, height: format.height },
          ]),
        ).values(),
      ]
      const videoResolutions = device.getSupportedResolutions('video')
      expect(videoResolutions).toHaveLength(expectedResolutions.length)
      expect(videoResolutions).toEqual(
        expect.arrayContaining(expectedResolutions),
      )
      const expectedPixelFormats = [
        ...new Set(spec.formats.map((format) => format.pixelFormat)),
      ]
      expect(device.supportedPixelFormats).toHaveLength(
        expectedPixelFormats.length,
      )
      expect(device.supportedPixelFormats).toEqual(
        expect.arrayContaining(expectedPixelFormats),
      )
    }
  })

  // Android fake mode has no CameraCharacteristics (VisionCamera reads resolutions/pixel formats from them),
  // so stream-size and pixel-format assertions run on the real emulator camera in fakecamera.scene.harness.ts.

  it('reports the catalog lens aperture', async (context) => {
    if (Platform.OS !== 'ios') {
      return context.skip('lensAperture: iOS only')
    }
    for (const spec of catalog.devices) {
      const device = factory.getCameraForId(spec.id)
      assert.exists(device, `device ${spec.id} is missing`)
      expect(device.lensAperture).toBeCloseTo(spec.lensAperture, 2)
    }
  })

  it('stores and returns the user preferred camera', async (context) => {
    if (Platform.OS !== 'ios') {
      return context.skip('userPreferredCamera: iOS only')
    }
    const majorVersion = Number.parseInt(String(Platform.Version), 10)
    if (majorVersion < 17) {
      return context.skip('userPreferredCamera: iOS 17+ only')
    }
    const front = factory.getCameraForId('fake-front-wide')
    assert.exists(front, 'fake-front-wide is missing')
    factory.userPreferredCamera = front
    expect(factory.userPreferredCamera?.id).toBe('fake-front-wide')
    factory.userPreferredCamera = undefined
    expect(factory.userPreferredCamera).toBeUndefined()
  })
})
