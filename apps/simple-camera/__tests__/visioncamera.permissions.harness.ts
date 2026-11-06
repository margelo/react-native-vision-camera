import { describe, expect, it } from 'react-native-harness'
import { VisionCamera } from 'react-native-vision-camera'
import { withTimeout } from './test-utils'

describe('VisionCamera - Permissions', () => {
  it('resolves camera and microphone requests that are started in parallel', async () => {
    expect(VisionCamera.cameraPermissionStatus).toBe('authorized')
    expect(VisionCamera.microphonePermissionStatus).toBe('authorized')

    const parallelRequests = Promise.all([
      VisionCamera.requestCameraPermission(),
      VisionCamera.requestMicrophonePermission(),
    ])
    const [hasCameraPermission, hasMicrophonePermission] = await withTimeout(
      parallelRequests,
      10_000,
      'parallel camera + microphone permission requests',
    )

    expect(hasCameraPermission).toBe(true)
    expect(hasMicrophonePermission).toBe(true)
  })

  it('resolves every request when the same permission is requested multiple times at once', async () => {
    expect(VisionCamera.cameraPermissionStatus).toBe('authorized')

    const parallelRequests = Promise.all([
      VisionCamera.requestCameraPermission(),
      VisionCamera.requestCameraPermission(),
      VisionCamera.requestCameraPermission(),
    ])
    const results = await withTimeout(
      parallelRequests,
      10_000,
      'parallel camera permission requests',
    )

    expect(results).toEqual([true, true, true])
  })
})
