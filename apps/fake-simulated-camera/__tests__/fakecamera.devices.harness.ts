import { Platform } from 'react-native'
import { assert, beforeAll, describe, expect, it } from 'react-native-harness'
import type { CameraDeviceFactory } from 'react-native-vision-camera'
import { VisionCamera } from 'react-native-vision-camera'

// Expectations are literals, exactly as an app developer would assert them against the fake camera the app
// injects. No catalog is imported — the tests only touch public VisionCamera API. Platform guards appear only
// where the two camera frameworks genuinely expose different information, and each says why.
const BACK_WIDE = {
  id: 'fake-back-wide',
  position: 'back' as const,
  type: 'wide-angle' as const,
  hasFlash: true,
  hasTorch: true,
  minZoom: 1,
  maxZoom: 6,
  lensAperture: 1.6,
  focalLength: 24,
  videoResolutions: [
    { width: 1920, height: 1080 },
    { width: 3840, height: 2160 },
    { width: 1280, height: 720 },
  ],
  fpsRanges: [
    { min: 1, max: 60 },
    { min: 1, max: 30 },
    { min: 1, max: 240 },
  ],
}
const ULTRA_WIDE = {
  id: 'fake-back-ultra-wide',
  position: 'back' as const,
  type: 'ultra-wide-angle' as const,
  hasFlash: true,
  hasTorch: true,
  minZoom: 1,
  maxZoom: 1,
  lensAperture: 2.4,
  focalLength: 13,
  videoResolutions: [{ width: 1920, height: 1080 }],
  fpsRanges: [{ min: 1, max: 30 }],
}
const FRONT = {
  id: 'fake-front-wide',
  position: 'front' as const,
  type: 'wide-angle' as const,
  hasFlash: false,
  hasTorch: false,
  minZoom: 1,
  maxZoom: 1,
  lensAperture: 2.2,
  focalLength: 23,
  videoResolutions: [
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
  ],
  fpsRanges: [
    { min: 1, max: 60 },
    { min: 1, max: 30 },
  ],
}
const DEVICES = [BACK_WIDE, ULTRA_WIDE, FRONT]

describe('FakeCamera - Devices', () => {
  let factory: CameraDeviceFactory

  beforeAll(async () => {
    await VisionCamera.requestCameraPermission()
    expect(VisionCamera.cameraPermissionStatus).toBe('authorized')
    factory = await VisionCamera.createDeviceFactory()
  })

  it('enumerates exactly the injected devices in order', () => {
    expect(factory.cameraDevices.map((device) => device.id)).toEqual(
      DEVICES.map((device) => device.id),
    )
  })

  it('reports position, type, flash, torch and zoom', () => {
    for (const spec of DEVICES) {
      const device = factory.getCameraForId(spec.id)
      assert.exists(device, `device ${spec.id} is missing`)
      expect(device.position).toBe(spec.position)
      expect(device.type).toBe(spec.type)
      expect(device.hasFlash).toBe(spec.hasFlash)
      expect(device.hasTorch).toBe(spec.hasTorch)
      expect(device.minZoom).toBe(spec.minZoom)
      expect(device.maxZoom).toBe(spec.maxZoom)
      expect(device.physicalDevices).toHaveLength(0)
      expect(device.isVirtualDevice).toBe(false)
    }
  })

  it('selects the first device of each position as the default camera', () => {
    expect(factory.getDefaultCamera('back')?.id).toBe('fake-back-wide')
    expect(factory.getDefaultCamera('front')?.id).toBe('fake-front-wide')
    expect(factory.getDefaultCamera('external')).toBeUndefined()
  })

  it('round-trips every id through getCameraForId and rejects unknown ids', () => {
    for (const spec of DEVICES) {
      expect(factory.getCameraForId(spec.id)?.id).toBe(spec.id)
    }
    expect(factory.getCameraForId('not-a-real-camera')).toBeUndefined()
  })

  it('exposes the union of the device fps ranges', () => {
    for (const spec of DEVICES) {
      const device = factory.getCameraForId(spec.id)
      assert.exists(device, `device ${spec.id} is missing`)
      expect(device.supportedFPSRanges).toHaveLength(spec.fpsRanges.length)
      expect(device.supportedFPSRanges).toEqual(
        expect.arrayContaining(spec.fpsRanges),
      )
    }
  })

  it('answers supportsFPS from the fps ranges', () => {
    expect(factory.getCameraForId('fake-back-wide')?.supportsFPS(60)).toBe(true)
    expect(factory.getCameraForId('fake-back-wide')?.supportsFPS(240)).toBe(
      true,
    )
    expect(factory.getCameraForId('fake-back-wide')?.supportsFPS(241)).toBe(
      false,
    )
    expect(
      factory.getCameraForId('fake-back-ultra-wide')?.supportsFPS(30),
    ).toBe(true)
    expect(
      factory.getCameraForId('fake-back-ultra-wide')?.supportsFPS(60),
    ).toBe(false)
    expect(factory.getCameraForId('fake-front-wide')?.supportsFPS(60)).toBe(
      true,
    )
    expect(factory.getCameraForId('fake-front-wide')?.supportsFPS(120)).toBe(
      false,
    )
  })

  it('reports HDR video dynamic ranges only for the HDR device', () => {
    const backWide = factory.getCameraForId('fake-back-wide')
    const front = factory.getCameraForId('fake-front-wide')
    assert.exists(backWide, 'fake-back-wide is missing')
    assert.exists(front, 'fake-front-wide is missing')
    expect(
      backWide.supportedVideoDynamicRanges.map((r) => r.bitDepth),
    ).toContain('hdr-10-bit')
    expect(
      backWide.supportedVideoDynamicRanges.map((r) => r.bitDepth),
    ).toContain('sdr-8-bit')
    expect(
      front.supportedVideoDynamicRanges.map((r) => r.bitDepth),
    ).not.toContain('hdr-10-bit')
  })

  it('lists the video resolutions', () => {
    for (const spec of DEVICES) {
      const device = factory.getCameraForId(spec.id)
      assert.exists(device, `device ${spec.id} is missing`)
      const resolutions = device.getSupportedResolutions('video')
      expect(resolutions).toEqual(expect.arrayContaining(spec.videoResolutions))
    }
  })

  it('reports the lens aperture', () => {
    for (const spec of DEVICES) {
      const device = factory.getCameraForId(spec.id)
      assert.exists(device, `device ${spec.id} is missing`)
      expect(device.lensAperture).toBeCloseTo(spec.lensAperture, 2)
    }
  })

  it('reports the focal length', () => {
    for (const spec of DEVICES) {
      const device = factory.getCameraForId(spec.id)
      assert.exists(device, `device ${spec.id} is missing`)
      expect(device.focalLength).toBeCloseTo(spec.focalLength, 1)
    }
  })

  // Cinematic stabilization is an AVFoundation-only mode; CameraX has no equivalent, so it is asserted on iOS only.
  it('reports cinematic stabilization on iOS', async (context) => {
    if (Platform.OS !== 'ios') {
      return context.skip('cinematic stabilization: AVFoundation-only mode')
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

  // CameraX only models stabilization ON/OFF and maps every non-standard mode to false, so Android asserts that.
  it('reports standard-only stabilization on Android', async (context) => {
    if (Platform.OS !== 'android') {
      return context.skip('CameraX stabilization is ON/OFF only')
    }
    const backWide = factory.getCameraForId('fake-back-wide')
    const ultraWide = factory.getCameraForId('fake-back-ultra-wide')
    assert.exists(backWide, 'fake-back-wide is missing')
    assert.exists(ultraWide, 'fake-back-ultra-wide is missing')
    expect(backWide.supportsVideoStabilizationMode('standard')).toBe(true)
    expect(backWide.supportsVideoStabilizationMode('cinematic')).toBe(false)
    expect(ultraWide.supportsVideoStabilizationMode('standard')).toBe(false)
  })

  // AVFoundation exposes a pixel format per capture format; the fake reports the exact catalog formats.
  it('lists the AVFoundation pixel formats on iOS', async (context) => {
    if (Platform.OS !== 'ios') {
      return context.skip('per-format pixel formats: AVFoundation granularity')
    }
    const backWide = factory.getCameraForId('fake-back-wide')
    assert.exists(backWide, 'fake-back-wide is missing')
    expect(backWide.supportedPixelFormats).toEqual(
      expect.arrayContaining([
        'yuv-420-8-bit-video',
        'yuv-420-8-bit-full',
        'yuv-420-10-bit-video',
      ]),
    )
  })

  // Camera2 exposes coarser output formats (YUV_420_888 / PRIVATE) with no per-format range, so Android sees fewer.
  it('lists the Camera2 output pixel formats on Android', async (context) => {
    if (Platform.OS !== 'android') {
      return context.skip('coarse output formats: Camera2 granularity')
    }
    const backWide = factory.getCameraForId('fake-back-wide')
    assert.exists(backWide, 'fake-back-wide is missing')
    expect(backWide.supportedPixelFormats).toEqual(
      expect.arrayContaining(['private', 'yuv-420-8-bit-full']),
    )
  })

  // userPreferredCamera is an iOS 17+ AVFoundation API with no Android equivalent.
  it('stores and returns the user preferred camera on iOS', async (context) => {
    if (Platform.OS !== 'ios') {
      return context.skip('userPreferredCamera: AVFoundation-only API')
    }
    if (Number.parseInt(String(Platform.Version), 10) < 17) {
      return context.skip('userPreferredCamera: iOS 17+ only')
    }
    const front = factory.getCameraForId('fake-front-wide')
    const backWide = factory.getCameraForId('fake-back-wide')
    assert.exists(front, 'fake-front-wide is missing')
    assert.exists(backWide, 'fake-back-wide is missing')
    factory.userPreferredCamera = front
    expect(factory.userPreferredCamera?.id).toBe('fake-front-wide')
    // VisionCamera's setter ignores a nil value, so the last camera set wins — assert an overwrite, not a clear.
    factory.userPreferredCamera = backWide
    expect(factory.userPreferredCamera?.id).toBe('fake-back-wide')
  })
})
