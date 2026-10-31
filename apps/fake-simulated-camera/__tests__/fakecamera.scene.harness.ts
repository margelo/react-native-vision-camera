import { Platform } from 'react-native'
import { assert, beforeAll, describe, expect, it } from 'react-native-harness'
import type { CameraDeviceFactory } from 'react-native-vision-camera'
import { VisionCamera } from 'react-native-vision-camera'

// Runs on the Android `android-scene` runner only: the emulator's real Camera2 cameras (virtual scene),
// so every expectation is derived from the running device instead of the catalog.
describe('FakeCamera - Emulator scene camera', () => {
  let factory: CameraDeviceFactory

  beforeAll(async () => {
    await VisionCamera.requestCameraPermission()
    expect(VisionCamera.cameraPermissionStatus).toBe('authorized')
    factory = await VisionCamera.createDeviceFactory()
  })

  it('round-trips the Camera2 ids of the emulator cameras', async (context) => {
    if (Platform.OS !== 'android') {
      return context.skip('emulator scene camera: Android only')
    }
    expect(factory.cameraDevices).not.toHaveLength(0)
    for (const device of factory.cameraDevices) {
      const lookedUp = factory.getCameraForId(device.id)
      assert.exists(lookedUp, `getCameraForId(${device.id}) returned nothing`)
      expect(lookedUp.id).toBe(device.id)
    }
  })

  it('exposes Camera2 stream sizes and pixel formats', async (context) => {
    if (Platform.OS !== 'android') {
      return context.skip('emulator scene camera: Android only')
    }
    const back = factory.getDefaultCamera('back')
    assert.exists(back, 'no back camera')
    const videoResolutions = back.getSupportedResolutions('video')
    expect(videoResolutions).not.toHaveLength(0)
    for (const resolution of videoResolutions) {
      expect(resolution.width).toBeGreaterThan(0)
      expect(resolution.height).toBeGreaterThan(0)
    }
    expect(back.supportedPixelFormats).toContain('private')
  })

  it('keeps supportsFPS consistent with supportedFPSRanges', async (context) => {
    if (Platform.OS !== 'android') {
      return context.skip('emulator scene camera: Android only')
    }
    for (const device of factory.cameraDevices) {
      expect(device.supportedFPSRanges).not.toHaveLength(0)
      const maxFps = Math.max(
        ...device.supportedFPSRanges.map((range) => range.max),
      )
      expect(device.supportsFPS(maxFps)).toBe(true)
      expect(device.supportsFPS(maxFps + 1)).toBe(false)
    }
  })
})
