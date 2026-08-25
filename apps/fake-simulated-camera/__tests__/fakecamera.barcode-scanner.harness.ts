import { Platform } from 'react-native'
import { assert, beforeAll, describe, expect, it } from 'react-native-harness'
import type {
  CameraDevice,
  CameraDeviceFactory,
} from 'react-native-vision-camera'
import { VisionCamera } from 'react-native-vision-camera'
import {
  type Barcode,
  createBarcodeScannerOutput,
} from 'react-native-vision-camera-barcode-scanner'
import { deferred, withTimeout } from './test-utils'

// The scene (scenes/qr-code-margelo.png) encodes this value; the fake camera (iOS) or the emulator's
// virtual-scene poster (Android) puts it in front of the back camera.
const sceneQrCodeValue = 'https://margelo.com'

describe('FakeCamera - Barcode Scanner', () => {
  let factory: CameraDeviceFactory
  let backDevice: CameraDevice

  beforeAll(async () => {
    await VisionCamera.requestCameraPermission()
    expect(VisionCamera.cameraPermissionStatus).toBe('authorized')
    factory = await VisionCamera.createDeviceFactory()
    const back = factory.getDefaultCamera('back')
    assert.exists(back, 'no back camera')
    backDevice = back
  })

  // iOS fake mode streams the QR scene full-frame into the camera. On Android the fake camera produces no
  // frames yet (frame injection is the optional slice E), and the emulator's virtual-scene poster is angled
  // and too small for reliable detection — so the barcode E2E runs on iOS only.
  it('scans the QR code in the camera scene', async (context) => {
    if (Platform.OS !== 'ios') {
      return context.skip(
        'barcode scanning: iOS fake camera only (Android frame injection is slice E)',
      )
    }
    const session = await VisionCamera.createCameraSession(false)
    const firstBarcodes = deferred<Barcode[]>()
    const barcodeOutput = createBarcodeScannerOutput({
      barcodeFormats: ['qr-code'],
      onBarcodeScanned: (barcodes) => {
        if (barcodes.length > 0) {
          firstBarcodes.resolve(barcodes)
        }
      },
      onError: firstBarcodes.reject,
    })
    const started = deferred()
    const stopped = deferred()
    const startSub = session.addOnStartedListener(started.resolve)
    const stopSub = session.addOnStoppedListener(stopped.resolve)
    const errorSub = session.addOnErrorListener((error) => {
      started.reject(error)
      stopped.reject(error)
      firstBarcodes.reject(error)
    })
    let didStart = false
    try {
      await session.configure([
        {
          input: backDevice,
          outputs: [{ output: barcodeOutput, mirrorMode: 'off' }],
          constraints: [],
        },
      ])
      await session.start()
      didStart = true
      await withTimeout(started.promise, 10_000, 'session start')

      const barcodes = await withTimeout(
        firstBarcodes.promise,
        20_000,
        'scan the QR code in the scene',
      )
      expect(barcodes).toHaveLength(1)
      expect(barcodes[0]).toHaveProperty('format', 'qr-code')
      expect(barcodes[0]).toHaveProperty('rawValue', sceneQrCodeValue)

      const resolution = barcodeOutput.currentResolution
      assert.exists(resolution, 'barcode output has no current resolution')
      const box = barcodes[0]?.boundingBox
      assert.exists(box, 'barcode has no bounding box')
      const frameLongEdge = Math.max(resolution.width, resolution.height)
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.top).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(frameLongEdge)
      expect(box.bottom).toBeLessThanOrEqual(frameLongEdge)
      expect(box.right).toBeGreaterThan(box.left)
      expect(box.bottom).toBeGreaterThan(box.top)
    } finally {
      startSub.remove()
      errorSub.remove()
      if (didStart) {
        await session.stop()
        await withTimeout(stopped.promise, 10_000, 'session stop')
      }
      stopSub.remove()
    }
  })
})
