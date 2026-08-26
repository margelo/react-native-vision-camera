import { Platform } from 'react-native'
import { assert, beforeAll, describe, expect, it } from 'react-native-harness'
import type {
  CameraDevice,
  CameraDeviceFactory,
} from 'react-native-vision-camera'
import { CommonResolutions, VisionCamera } from 'react-native-vision-camera'
import { deferred, withTimeout } from './test-utils'

// The fake pump delivers BGRA on the iOS Simulator; on the Android emulator ImageAnalysis rejects PRIVATE on the
// swiftshader GPU, so YUV is requested there. This configures the output for what each fake actually delivers.
const FRAME_PIXEL_FORMAT = Platform.OS === 'ios' ? 'rgb' : 'yuv'

function makeFrameOutput() {
  return VisionCamera.createFrameOutput({
    targetResolution: CommonResolutions.HD_16_9,
    pixelFormat: FRAME_PIXEL_FORMAT,
    enablePreviewSizedOutputBuffers: false,
    enablePhysicalBufferRotation: false,
    enableCameraMatrixDelivery: false,
    allowDeferredStart: false,
    dropFramesWhileBusy: true,
  })
}

describe('FakeCamera - Session', () => {
  let factory: CameraDeviceFactory
  let backWide: CameraDevice
  let front: CameraDevice

  beforeAll(async () => {
    await VisionCamera.requestCameraPermission()
    expect(VisionCamera.cameraPermissionStatus).toBe('authorized')
    factory = await VisionCamera.createDeviceFactory()
    const back = factory.getCameraForId('fake-back-wide')
    const frontDevice = factory.getCameraForId('fake-front-wide')
    assert.exists(back, 'fake-back-wide is missing')
    assert.exists(frontDevice, 'fake-front-wide is missing')
    backWide = back
    front = frontDevice
  })

  it('configures, starts and stops a session on the fake camera', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const frameOutput = makeFrameOutput()
    const started = deferred()
    const stopped = deferred()
    const startSub = session.addOnStartedListener(started.resolve)
    const stopSub = session.addOnStoppedListener(stopped.resolve)
    const errorSub = session.addOnErrorListener((error) => {
      started.reject(error)
      stopped.reject(error)
    })
    try {
      const controllers = await session.configure([
        {
          input: backWide,
          outputs: [{ output: frameOutput, mirrorMode: 'auto' }],
          constraints: [],
        },
      ])
      expect(controllers).toHaveLength(1)
      expect(controllers[0]).toHaveProperty('device.id', 'fake-back-wide')

      await session.start()
      await withTimeout(started.promise, 10_000, 'session start')
      expect(session.isRunning).toBe(true)
      await session.stop()
      await withTimeout(stopped.promise, 10_000, 'session stop')
      expect(session.isRunning).toBe(false)
    } finally {
      startSub.remove()
      stopSub.remove()
      errorSub.remove()
    }
  })

  it('reconfigures a stopped session with another device and output', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const firstOutput = makeFrameOutput()
    const secondOutput = makeFrameOutput()
    const errors: Error[] = []
    const errorSub = session.addOnErrorListener((error) => errors.push(error))
    try {
      const firstControllers = await session.configure([
        {
          input: backWide,
          outputs: [{ output: firstOutput, mirrorMode: 'auto' }],
          constraints: [],
        },
      ])
      expect(firstControllers[0]).toHaveProperty('device.id', 'fake-back-wide')
      await session.start()
      await session.stop()

      const secondControllers = await session.configure([
        {
          input: front,
          outputs: [{ output: secondOutput, mirrorMode: 'auto' }],
          constraints: [],
        },
      ])
      expect(secondControllers).toHaveLength(1)
      expect(secondControllers[0]).toHaveProperty(
        'device.id',
        'fake-front-wide',
      )
      expect(errors).toHaveLength(0)
    } finally {
      errorSub.remove()
    }
  })

  // currentResolution reads AVCaptureConnection.inputStreamResolution; the Android equivalent is covered by the
  // scene runner, so the negotiated-resolution assertion runs on iOS only.
  it('reports the negotiated format resolution on the attached output', async (context) => {
    if (Platform.OS !== 'ios') {
      return context.skip('AVCaptureConnection input resolution: iOS only')
    }
    const session = await VisionCamera.createCameraSession(false)
    const frameOutput = makeFrameOutput()
    expect(frameOutput.currentResolution).toBeUndefined()
    await session.configure([
      {
        input: backWide,
        outputs: [{ output: frameOutput, mirrorMode: 'auto' }],
        constraints: [{ fps: 60 }],
      },
    ])
    expect(frameOutput.currentResolution).toEqual({ width: 1920, height: 1080 })
  })
})
