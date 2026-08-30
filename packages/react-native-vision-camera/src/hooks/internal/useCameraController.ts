import { useEffect, useMemo, useState } from 'react'
import type { CameraController } from '../../specs/CameraController.nitro'
import type { TargetCameraPosition } from '../../specs/common-types/CameraPosition'
import type { Constraint } from '../../specs/common-types/Constraint'
import type { MirrorMode } from '../../specs/common-types/MirrorMode'
import type { CameraDevice } from '../../specs/inputs/CameraDevice.nitro'
import type { CameraOutput } from '../../specs/outputs/CameraOutput.nitro'
import type { CameraSession } from '../../specs/session/CameraSession.nitro'
import type { CameraSessionConfig } from '../../specs/session/CameraSessionConfig.nitro'
import type { CameraSessionConfiguration } from '../../specs/session/CameraSessionConfiguration'
import { useMemoizedArray } from './useMemoizedArray'
import { useMemoizedConstraints } from './useMemoizedConstraints'
import { useStableCallback } from './useStableCallback'

interface Config extends CameraSessionConfiguration {
  mirrorMode?: MirrorMode
  constraints?: Constraint[]
  onSessionConfigSelected?: (config: CameraSessionConfig) => void

  onError: (error: Error) => void
  onConfigured?: () => void
  getInitialZoom?: () => number | undefined
  getInitialExposureBias?: () => number | undefined
}

/**
 * Connect the given {@linkcode device} to the given {@linkcode outputs}
 * with the given {@linkcode mirrorMode}  applied to each output,
 * and return a {@linkcode CameraController}.
 *
 * @note The {@linkcode outputs} have to be explicitly memoized.
 */
export function useCameraController(
  session: CameraSession | undefined,
  device: CameraDevice | TargetCameraPosition | undefined,
  outputs: CameraOutput[],
  {
    mirrorMode = 'auto',
    constraints = [],
    onSessionConfigSelected,
    allowBackgroundAudioPlayback,
    allowHapticsAndSystemSoundsPlayback,
    getInitialExposureBias,
    onError,
    onConfigured,
    getInitialZoom,
  }: Config,
): CameraController | undefined {
  const [controller, setController] = useState<CameraController>()

  // Keep some things stable so the `useEffect` doesn't re-trigger
  const stableOutputs = useMemoizedArray(outputs)
  const stableGetInitialExposureBias = useStableCallback(
    getInitialExposureBias ?? (() => undefined),
  )
  const stableGetInitialZoom = useStableCallback(
    getInitialZoom ?? (() => undefined),
  )
  const stableOnConfigured = useStableCallback(onConfigured ?? (() => {}))
  const stableOnSessionConfigSelected = useStableCallback(
    onSessionConfigSelected ?? (() => {}),
  )
  const stableOnError = useStableCallback(onError)

  const stableUserConstraints = useMemoizedConstraints(constraints)
  const stableConstraints = useMemo<Constraint[]>(() => {
    return [
      ...stableUserConstraints,
      ...stableOutputs.map<Constraint>((o) => ({ resolutionBias: o })),
    ]
  }, [stableUserConstraints, stableOutputs])

  // This effect re-configures the CameraSession and returns a `controller`.
  // This is expensive and should only be done if any inputs change.
  // To prevent shallow inequality causing a re-configuration,
  // we memoize all objects, callbacks or arrays beforehand.
  useEffect(() => {
    if (session == null) {
      // default: null -> empty controllers
      setController(undefined)
      return
    }

    let isCanceled = false
    const load = async () => {
      try {
        if (device == null) {
          // No device, configure with empty devices
          session.configure([], {})
          setController(undefined)
        } else {
          // Device + outputs - configure session
          const controllers = await session.configure(
            [
              {
                input: device,
                outputs: stableOutputs.map((o) => ({
                  output: o,
                  mirrorMode: mirrorMode,
                })),
                constraints: stableConstraints,
                initialExposureBias: stableGetInitialExposureBias?.(),
                initialZoom: stableGetInitialZoom?.(),
                onSessionConfigSelected: stableOnSessionConfigSelected,
              },
            ],
            {
              allowBackgroundAudioPlayback: allowBackgroundAudioPlayback,
              allowHapticsAndSystemSoundsPlayback:
                allowHapticsAndSystemSoundsPlayback,
            },
          )
          if (isCanceled) {
            controllers.forEach((c) => {
              c.dispose()
            })
            return
          }
          stableOnConfigured?.()
          setController(controllers[0])
        }
      } catch (error) {
        stableOnError(error as Error)
      }
    }
    load()
    return () => {
      isCanceled = true
    }
  }, [
    device,
    mirrorMode,
    session,
    allowBackgroundAudioPlayback,
    allowHapticsAndSystemSoundsPlayback,
    stableOutputs,
    stableOnConfigured,
    stableGetInitialExposureBias,
    stableGetInitialZoom,
    stableOnSessionConfigSelected,
    stableConstraints,
    stableOnError,
  ])

  return controller
}
