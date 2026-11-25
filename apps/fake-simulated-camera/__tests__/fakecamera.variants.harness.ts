import { assert, beforeAll, describe, expect, it } from 'react-native-harness'
import type { CameraDeviceFactory } from 'react-native-vision-camera'
import { VisionCamera } from 'react-native-vision-camera'

// Runs only when the app is launched with FAKE_CAMERA_CATALOG=variants. This catalog is a robustness fixture:
// two near-identical back cameras that differ ONLY in maxZoom, plus a front camera — a different device set than
// `default`, which proves the fake pipeline is catalog-agnostic (not hardcoded to the default devices).
describe('FakeCamera - Variants catalog', () => {
  let factory: CameraDeviceFactory

  beforeAll(async () => {
    await VisionCamera.requestCameraPermission()
    expect(VisionCamera.cameraPermissionStatus).toBe('authorized')
    factory = await VisionCamera.createDeviceFactory()
  })

  it('enumerates exactly the variant devices in order (different count than default)', () => {
    const ids = factory.cameraDevices.map((device) => device.id)
    expect(ids).toEqual([
      'fake-twin-a',
      'fake-twin-b',
      'fake-slow-fps',
      'fake-hdr-variant',
      'fake-variant-tele',
      'fake-variant-front',
      'fake-clone-a',
      'fake-clone-b',
    ])
    // Default catalog has 3 devices; this one has 8 — the pipeline is not hardcoded to a device count.
    expect(ids).toHaveLength(8)
  })

  it('never dedupes two devices that are identical except their id', () => {
    const a = factory.getCameraForId('fake-clone-a')
    const b = factory.getCameraForId('fake-clone-b')
    assert.exists(a, 'fake-clone-a is missing')
    assert.exists(b, 'fake-clone-b is missing')
    // Both are present and each round-trips to itself:
    expect(a.id).toBe('fake-clone-a')
    expect(b.id).toBe('fake-clone-b')
    expect(a.id).not.toBe(b.id)
    // Every capability the public API exposes is identical — only the id differs:
    expect(a.position).toBe(b.position)
    expect(a.type).toBe(b.type)
    expect(a.hasFlash).toBe(b.hasFlash)
    expect(a.hasTorch).toBe(b.hasTorch)
    expect(a.minZoom).toBe(b.minZoom)
    expect(a.maxZoom).toBe(b.maxZoom)
    expect(a.lensAperture).toBeCloseTo(b.lensAperture, 3)
    expect(a.focalLength).toBe(b.focalLength)
    expect(a.supportedFPSRanges).toEqual(b.supportedFPSRanges)
    expect(a.supportedPixelFormats).toEqual(b.supportedPixelFormats)
    expect(a.getSupportedResolutions('video')).toEqual(b.getSupportedResolutions('video'))
  })

  it('distinguishes near-identical devices that differ only in one format field', () => {
    const base = factory.getCameraForId('fake-twin-a')
    const slow = factory.getCameraForId('fake-slow-fps')
    const hdr = factory.getCameraForId('fake-hdr-variant')
    assert.exists(base, 'fake-twin-a is missing')
    assert.exists(slow, 'fake-slow-fps is missing')
    assert.exists(hdr, 'fake-hdr-variant is missing')
    // Differ only by the format's fps ceiling:
    expect(base.supportsFPS(60)).toBe(true)
    expect(slow.supportsFPS(60)).toBe(false)
    expect(slow.supportsFPS(30)).toBe(true)
    // Differ only by the format being HDR:
    expect(base.supportedVideoDynamicRanges.map((r) => r.bitDepth)).not.toContain('hdr-10-bit')
    expect(hdr.supportedVideoDynamicRanges.map((r) => r.bitDepth)).toContain('hdr-10-bit')
  })

  it('reports the telephoto device type', () => {
    const tele = factory.getCameraForId('fake-variant-tele')
    assert.exists(tele, 'fake-variant-tele is missing')
    expect(tele.type).toBe('telephoto')
    expect(tele.position).toBe('back')
    expect(tele.maxZoom).toBe(3)
  })

  it('does not expose the default catalog devices (catalog was switched)', () => {
    expect(factory.getCameraForId('fake-back-wide')).toBeUndefined()
    expect(factory.getCameraForId('fake-back-ultra-wide')).toBeUndefined()
    expect(factory.getCameraForId('fake-front-wide')).toBeUndefined()
    expect(factory.getCameraForId('not-a-real-camera')).toBeUndefined()
  })

  it('selects the first back and the front as defaults', () => {
    expect(factory.getDefaultCamera('back')?.id).toBe('fake-twin-a')
    expect(factory.getDefaultCamera('front')?.id).toBe('fake-variant-front')
  })

  it('round-trips both near-identical twins distinctly', () => {
    expect(factory.getCameraForId('fake-twin-a')?.id).toBe('fake-twin-a')
    expect(factory.getCameraForId('fake-twin-b')?.id).toBe('fake-twin-b')
  })

  it('reports the twins as identical except maxZoom', () => {
    const a = factory.getCameraForId('fake-twin-a')
    const b = factory.getCameraForId('fake-twin-b')
    assert.exists(a, 'fake-twin-a is missing')
    assert.exists(b, 'fake-twin-b is missing')
    // The one authored difference:
    expect(a.maxZoom).toBe(4)
    expect(b.maxZoom).toBe(6)
    // Everything else is identical between the two near-identical devices — the difference is exactly maxZoom:
    expect(a.position).toBe(b.position)
    expect(a.type).toBe(b.type)
    expect(a.hasFlash).toBe(b.hasFlash)
    expect(a.hasTorch).toBe(b.hasTorch)
    expect(a.minZoom).toBe(b.minZoom)
    expect(a.lensAperture).toBeCloseTo(b.lensAperture, 3)
    expect(a.focalLength).toBe(b.focalLength)
    expect(a.supportedFPSRanges).toEqual(b.supportedFPSRanges)
    expect(a.supportedPixelFormats).toEqual(b.supportedPixelFormats)
    expect(a.supportedVideoDynamicRanges.map((r) => r.bitDepth)).toEqual(
      b.supportedVideoDynamicRanges.map((r) => r.bitDepth),
    )
    expect(a.getSupportedResolutions('video')).toEqual(b.getSupportedResolutions('video'))
    expect(a.supportsFPS(60)).toBe(true)
    expect(b.supportsFPS(60)).toBe(true)
    expect(a.position).toBe('back')
    expect(a.type).toBe('wide-angle')
    // They are distinct objects/ids, never deduped despite being near-identical:
    expect(a.id).not.toBe(b.id)
  })
})
