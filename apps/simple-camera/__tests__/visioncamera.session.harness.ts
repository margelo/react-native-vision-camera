import { Platform } from 'react-native'
import {
  assert,
  beforeAll,
  describe,
  expect,
  fn,
  it,
} from 'react-native-harness'
import type {
  CameraDeviceFactory,
  TargetCameraPosition,
} from 'react-native-vision-camera'
import { CommonResolutions, VisionCamera } from 'react-native-vision-camera'
import { deferred, withTimeout } from './test-utils'

describe('VisionCamera - Session', () => {
  let factory: CameraDeviceFactory

  beforeAll(async () => {
    await VisionCamera.requestCameraPermission()
    expect(VisionCamera.cameraPermissionStatus).toBe('authorized')
    factory = await VisionCamera.createDeviceFactory()
  })

  it('configures, starts and stops a session for every listed device', async () => {
    const devices = factory.cameraDevices
    expect(devices).not.toHaveLength(0)

    for (const device of devices) {
      const session = await VisionCamera.createCameraSession(false)
      const photoOutput = VisionCamera.createPhotoOutput({
        targetResolution: CommonResolutions.HD_4_3,
        containerFormat: 'jpeg',
        quality: 0.8,
        qualityPrioritization: 'balanced',
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
            input: device,
            outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
            constraints: [],
          },
        ])
        expect(controllers).toHaveLength(1)
        expect(controllers[0]).toHaveProperty('device.id', device.id)

        await session.start()
        await withTimeout(started.promise, 10_000, 'session start')
        await session.stop()
        await withTimeout(stopped.promise, 10_000, 'session stop')
      } finally {
        startSub.remove()
        stopSub.remove()
        errorSub.remove()
      }
    }
  })

  it('configures a session directly from each target camera position', async () => {
    const positions: TargetCameraPosition[] = ['back', 'front', 'external']
    const session = await VisionCamera.createCameraSession(false)
    const previewOutput = VisionCamera.createPreviewOutput()
    const photoOutput = VisionCamera.createPhotoOutput({
      containerFormat: 'native',
      quality: 1,
      qualityPrioritization: 'balanced',
      targetResolution: CommonResolutions.HD_4_3,
    })

    try {
      for (const position of positions) {
        const hasDeviceAtPosition = factory.cameraDevices.some(
          (device) => device.position === position,
        )
        const configurePromise = session.configure([
          {
            input: position,
            outputs: [
              {
                output: previewOutput,
                mirrorMode: position === 'front' ? 'on' : 'auto',
              },
              { output: photoOutput, mirrorMode: 'auto' },
            ],
            constraints: [],
          },
        ])

        if (!hasDeviceAtPosition) {
          await expect(configurePromise).rejects.toThrow()
          continue
        }

        const controllers = await configurePromise
        expect(controllers).toHaveLength(1)
        expect(controllers[0]).toHaveProperty('device.position', position)
      }
    } finally {
      await session.stop()
    }
  })

  it('fires onStarted/onStopped exactly once per lifecycle', async () => {
    const device = factory.getDefaultCamera('back')
    assert.exists(device, 'no back camera')

    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })

    const started = deferred()
    const stopped = deferred()
    const onStarted = fn(() => {
      started.resolve()
    })
    const onStopped = fn(() => {
      stopped.resolve()
    })
    const startSub = session.addOnStartedListener(onStarted)
    const stopSub = session.addOnStoppedListener(onStopped)
    const errorSub = session.addOnErrorListener((error) => {
      started.reject(error)
      stopped.reject(error)
    })

    try {
      await session.configure([
        {
          input: device,
          outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
          constraints: [],
        },
      ])

      await session.start()
      await withTimeout(started.promise, 10_000, 'session start')

      await session.stop()
      await withTimeout(stopped.promise, 10_000, 'session stop')

      expect(onStarted).toHaveBeenCalledTimes(1)
      expect(onStopped).toHaveBeenCalledTimes(1)
    } finally {
      startSub.remove()
      stopSub.remove()
      errorSub.remove()
    }
  })

  it('stops delivering events after a listener subscription is removed', async () => {
    const device = factory.getDefaultCamera('back')
    assert.exists(device, 'no back camera')

    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })

    await session.configure([
      {
        input: device,
        outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])

    const removedStartListener = fn()
    const startSub = session.addOnStartedListener(removedStartListener)
    startSub.remove()

    // Second listener we keep attached so we can observe that the session
    // actually started before requesting a stop.
    const started = deferred()
    const stopped = deferred()
    const secondStartSub = session.addOnStartedListener(started.resolve)
    const stopSub = session.addOnStoppedListener(stopped.resolve)
    const errorSub = session.addOnErrorListener((error) => {
      started.reject(error)
      stopped.reject(error)
    })

    try {
      await session.start()
      await withTimeout(started.promise, 10_000, 'session start')
      await session.stop()
      await withTimeout(stopped.promise, 10_000, 'session stop')

      expect(removedStartListener).not.toHaveBeenCalled()
    } finally {
      secondStartSub.remove()
      stopSub.remove()
      errorSub.remove()
    }
  })

  it('registers an onError listener without throwing', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const subscription = session.addOnErrorListener(() => {})
    subscription.remove()
    await session.stop()
  })

  it('registers interruption listeners without throwing', async () => {
    const session = await VisionCamera.createCameraSession(false)
    const a = session.addOnInterruptionStartedListener(() => {})
    const b = session.addOnInterruptionEndedListener(() => {})
    a.remove()
    b.remove()
    await session.stop()
  })

  it('starts and reconfigures a session with haptics and system sounds playback enabled', async (context) => {
    if (Platform.OS !== 'ios') {
      return context.skip('allowHapticsAndSystemSoundsPlayback: iOS only')
    }
    const device = factory.getDefaultCamera('back')
    assert.exists(device, 'no back camera')

    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    const connection = {
      input: device,
      outputs: [{ output: photoOutput, mirrorMode: 'auto' as const }],
      constraints: [],
    }

    const started = deferred()
    const stopped = deferred()
    const startSub = session.addOnStartedListener(started.resolve)
    const stopSub = session.addOnStoppedListener(stopped.resolve)
    const errorSub = session.addOnErrorListener((error) => {
      started.reject(error)
      stopped.reject(error)
    })

    try {
      const controllers = await session.configure([connection], {
        allowHapticsAndSystemSoundsPlayback: true,
      })
      expect(controllers).toHaveLength(1)

      await session.start()
      await withTimeout(started.promise, 10_000, 'session start')

      const reconfiguredControllers = await session.configure([connection], {
        allowHapticsAndSystemSoundsPlayback: false,
      })
      expect(reconfiguredControllers).toHaveLength(1)

      await session.stop()
      await withTimeout(stopped.promise, 10_000, 'session stop')
    } finally {
      await session.stop()
      startSub.remove()
      stopSub.remove()
      errorSub.remove()
    }
  })

  it('starts and reconfigures a session with background audio playback enabled', async (context) => {
    if (Platform.OS !== 'ios') {
      return context.skip('allowBackgroundAudioPlayback: iOS only')
    }
    const device = factory.getDefaultCamera('back')
    assert.exists(device, 'no back camera')

    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    const connection = {
      input: device,
      outputs: [{ output: photoOutput, mirrorMode: 'auto' as const }],
      constraints: [],
    }

    const started = deferred()
    const stopped = deferred()
    const startSub = session.addOnStartedListener(started.resolve)
    const stopSub = session.addOnStoppedListener(stopped.resolve)
    const errorSub = session.addOnErrorListener((error) => {
      started.reject(error)
      stopped.reject(error)
    })

    try {
      const controllers = await session.configure([connection], {
        allowBackgroundAudioPlayback: true,
      })
      expect(controllers).toHaveLength(1)

      await session.start()
      await withTimeout(started.promise, 10_000, 'session start')

      const reconfiguredControllers = await session.configure([connection], {
        allowBackgroundAudioPlayback: false,
      })
      expect(reconfiguredControllers).toHaveLength(1)

      await session.stop()
      await withTimeout(stopped.promise, 10_000, 'session stop')
    } finally {
      await session.stop()
      startSub.remove()
      stopSub.remove()
      errorSub.remove()
    }
  })

  it('reconfigures a running session with a new output set', async () => {
    const device = factory.getDefaultCamera('back')
    assert.exists(device, 'no back camera')

    const session = await VisionCamera.createCameraSession(false)
    const photoOutput = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })

    await session.configure([
      {
        input: device,
        outputs: [{ output: photoOutput, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    await session.start()

    const videoOutput = VisionCamera.createVideoOutput({
      targetResolution: CommonResolutions.HD_16_9,
      enableAudio: false,
    })

    const controllers = await session.configure([
      {
        input: device,
        outputs: [
          { output: photoOutput, mirrorMode: 'auto' },
          { output: videoOutput, mirrorMode: 'auto' },
        ],
        constraints: [],
      },
    ])
    expect(controllers).toHaveLength(1)

    await session.stop()
  })

  it('keeps a stopped session bound when another session is configured and cleared', async () => {
    const backDevice = factory.getDefaultCamera('back')
    assert.exists(backDevice, 'no back camera')

    const sessionA = await VisionCamera.createCameraSession(false)
    const photoOutputA = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    await sessionA.configure([
      {
        input: backDevice,
        outputs: [{ output: photoOutputA, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    const startedA = deferred()
    const startSubA = sessionA.addOnStartedListener(startedA.resolve)
    await sessionA.start()
    await withTimeout(startedA.promise, 10_000, 'session A start')
    startSubA.remove()
    await sessionA.stop()

    // A second session on the same camera, set up and torn down the way a
    // second <Camera> mounting and unmounting does.
    const sessionB = await VisionCamera.createCameraSession(false)
    const photoOutputB = VisionCamera.createPhotoOutput({
      targetResolution: CommonResolutions.HD_4_3,
      containerFormat: 'jpeg',
      quality: 0.8,
      qualityPrioritization: 'balanced',
    })
    await sessionB.configure([
      {
        input: backDevice,
        outputs: [{ output: photoOutputB, mirrorMode: 'auto' }],
        constraints: [],
      },
    ])
    const startedB = deferred()
    const startSubB = sessionB.addOnStartedListener(startedB.resolve)
    await sessionB.start()
    await withTimeout(startedB.promise, 10_000, 'session B start')
    startSubB.remove()
    await sessionB.stop()
    await sessionB.configure([])

    // Session A was never reconfigured, so resuming it must work.
    const restartedA = deferred()
    const restartSubA = sessionA.addOnStartedListener(restartedA.resolve)
    await sessionA.start()
    await withTimeout(restartedA.promise, 10_000, 'session A restart')
    restartSubA.remove()

    const photo = await withTimeout(
      photoOutputA.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {},
      ),
      10_000,
      'session A capture after session B was cleared',
    )
    expect(photo.width).toBeGreaterThan(0)
    photo.dispose()

    await sessionA.stop()
  })

  it('supports a multi-cam session when the platform allows it', async (context) => {
    if (!VisionCamera.supportsMultiCamSessions) {
      return context.skip('multi-cam session: not supported on this platform')
    }
    const combination = factory.supportedMultiCamDeviceCombinations.find(
      (devices) => devices.length >= 2,
    )
    if (combination == null) {
      return context.skip(
        'multi-cam session: no multi-device combination reported on this device',
      )
    }

    const session = await VisionCamera.createCameraSession(true)
    const connections = combination.map((device) => ({
      input: device,
      outputs: [
        {
          output: VisionCamera.createPhotoOutput({
            targetResolution: CommonResolutions.HD_4_3,
            containerFormat: 'jpeg' as const,
            quality: 0.8,
            qualityPrioritization: 'balanced' as const,
          }),
          mirrorMode: 'auto' as const,
        },
      ],
      constraints: [],
    }))

    const controllers = await session.configure(connections)
    expect(controllers).toHaveLength(combination.length)
    const controllerDeviceIds = controllers.map(
      (controller) => controller.device.id,
    )
    const expectedDeviceIds = combination.map((device) => device.id)
    expect(controllerDeviceIds).toEqual(expectedDeviceIds)

    const started = deferred()
    const sub = session.addOnStartedListener(started.resolve)
    const errorSub = session.addOnErrorListener(started.reject)
    try {
      await session.start()
      await withTimeout(started.promise, 15_000, 'session start')
      await session.stop()
    } finally {
      sub.remove()
      errorSub.remove()
    }
  })

  it('configures a multi-cam session for every supported device combination', async (context) => {
    if (!VisionCamera.supportsMultiCamSessions) {
      return context.skip(
        'multi-cam combinations: not supported on this platform',
      )
    }
    const combinations = factory.supportedMultiCamDeviceCombinations
    if (combinations.length === 0) {
      return context.skip(
        'multi-cam combinations: no combinations reported on this device',
      )
    }

    const session = await VisionCamera.createCameraSession(true)
    try {
      // Starting every reported combination is expensive on physical devices.
      // The previous test covers actual lifecycle; this one covers the full
      // configure-time compatibility surface.
      for (const combination of combinations) {
        // iOS can report a singleton virtual camera (for example a Dual- or
        // Triple-Camera) as a supported multi-cam device set.
        expect(combination).not.toHaveLength(0)
        const connections = combination.map((device) => ({
          input: device,
          outputs: [
            {
              output: VisionCamera.createPhotoOutput({
                targetResolution: CommonResolutions.HD_4_3,
                containerFormat: 'jpeg' as const,
                quality: 0.8,
                qualityPrioritization: 'balanced' as const,
              }),
              mirrorMode: 'auto' as const,
            },
          ],
          constraints: [],
        }))
        const controllers = await session.configure(connections)
        const controllerDeviceIds = controllers.map(
          (controller) => controller.device.id,
        )
        const expectedDeviceIds = combination.map((device) => device.id)
        expect(controllerDeviceIds).toEqual(expectedDeviceIds)
      }
    } finally {
      await session.stop()
      await session.configure([])
    }
  })
})
