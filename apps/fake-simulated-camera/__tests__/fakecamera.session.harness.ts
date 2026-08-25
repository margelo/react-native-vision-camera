import { Platform } from 'react-native'
import { assert, beforeAll, describe, expect, it } from 'react-native-harness'
import type {
  CameraDevice,
  CameraDeviceFactory,
} from 'react-native-vision-camera'
import { CommonResolutions, VisionCamera } from 'react-native-vision-camera'
import { deferred, withTimeout } from './test-utils'

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
    const frameOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.HD_16_9,
      pixelFormat: 'native',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })
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

  it('keeps two sessions independent', async () => {
    const sessionA = await VisionCamera.createCameraSession(false)
    const sessionB = await VisionCamera.createCameraSession(false)
    const outputA = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.HD_16_9,
      pixelFormat: 'native',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })
    const outputB = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.HD_16_9,
      pixelFormat: 'native',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })
    const startedA = deferred()
    const startedB = deferred()
    const stoppedA = deferred()
    const subscriptions = [
      sessionA.addOnStartedListener(startedA.resolve),
      sessionB.addOnStartedListener(startedB.resolve),
      sessionA.addOnStoppedListener(stoppedA.resolve),
      sessionA.addOnErrorListener(startedA.reject),
      sessionB.addOnErrorListener(startedB.reject),
    ]
    let didStartB = false
    try {
      const controllersA = await sessionA.configure([
        {
          input: backWide,
          outputs: [{ output: outputA, mirrorMode: 'auto' }],
          constraints: [],
        },
      ])
      const controllersB = await sessionB.configure([
        {
          input: front,
          outputs: [{ output: outputB, mirrorMode: 'auto' }],
          constraints: [],
        },
      ])
      expect(controllersA[0]).toHaveProperty('device.id', 'fake-back-wide')
      expect(controllersB[0]).toHaveProperty('device.id', 'fake-front-wide')

      await sessionA.start()
      await withTimeout(startedA.promise, 10_000, 'session A start')
      expect(sessionA.isRunning).toBe(true)
      expect(sessionB.isRunning).toBe(false)

      await sessionB.start()
      didStartB = true
      await withTimeout(startedB.promise, 10_000, 'session B start')
      expect(sessionB.isRunning).toBe(true)

      await sessionA.stop()
      await withTimeout(stoppedA.promise, 10_000, 'session A stop')
      expect(sessionA.isRunning).toBe(false)
      expect(sessionB.isRunning).toBe(true)
    } finally {
      for (const subscription of subscriptions) {
        subscription.remove()
      }
      if (didStartB) {
        await sessionB.stop()
      }
    }
  })

  it('reconfigures a stopped session with another device and output', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const firstOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.HD_16_9,
      pixelFormat: 'native',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })
    const secondOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.HD_16_9,
      pixelFormat: 'native',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })
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
      await session.start()
      await session.stop()
      expect(errors).toHaveLength(0)
    } finally {
      errorSub.remove()
    }
  })

  it('reports the negotiated format resolution on the attached output', async (context) => {
    if (Platform.OS !== 'ios') {
      return context.skip('AVCaptureConnection input resolution: iOS only')
    }
    const session = await VisionCamera.createCameraSession(false)
    const frameOutput = VisionCamera.createFrameOutput({
      targetResolution: CommonResolutions.HD_16_9,
      pixelFormat: 'native',
      enablePreviewSizedOutputBuffers: false,
      enablePhysicalBufferRotation: false,
      enableCameraMatrixDelivery: false,
      allowDeferredStart: false,
      dropFramesWhileBusy: true,
    })
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
