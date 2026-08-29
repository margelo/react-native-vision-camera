import { useEffect, useState } from 'react'
import type { CameraSession } from '../../specs/session/CameraSession.nitro'
import { VisionCamera } from '../../VisionCamera'
import { useStableCallback } from './useStableCallback'

interface Props {
  enableMultiCamSupport: boolean
  onError: (error: Error) => void
}

export function useCameraSession({
  enableMultiCamSupport,
  onError,
}: Props): CameraSession | undefined {
  const [session, setSession] = useState<CameraSession>()
  const stableOnError = useStableCallback(onError)

  // session creation
  useEffect(() => {
    let isCanceled = false
    const load = async () => {
      try {
        const s = await VisionCamera.createCameraSession(enableMultiCamSupport)
        if (isCanceled) {
          s.dispose()
          return
        }
        setSession(s)
      } catch (error) {
        stableOnError(error as Error)
      }
    }
    load()
    return () => {
      isCanceled = true
    }
  }, [enableMultiCamSupport, stableOnError])

  // session teardown
  useEffect(() => {
    return () => { 
      // Detach outputswhile the session is still running so AVFoundation                                                                                                         
      // drains each output's figCaptureSession pointer synchronously.  
      session?.configure([])
      session?.stop()
    }
  }, [session])

  return session
}
