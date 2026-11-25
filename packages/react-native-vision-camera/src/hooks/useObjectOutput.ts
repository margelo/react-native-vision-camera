import { useEffect, useMemo } from 'react'
import type {
  ScannedObject,
  ScannedObjectType,
} from '../specs/instances/ScannedObject.nitro'
import type { CameraObjectOutput } from '../specs/outputs/CameraObjectOutput.nitro'
import { VisionCamera } from '../VisionCamera'

export interface UseObjectOutputProps {
  /**
   * The array of {@linkcode ScannedObjectType}s the {@linkcode CameraObjectOutput}
   * should scan for.
   */
  types: ScannedObjectType[]
  /**
   * A callback that will be called every time the {@linkcode CameraObjectOutput}
   * has scanned one or more objects.
   *
   * @see {@linkcode ScannedObject}
   */
  onObjectsScanned?: (objects: ScannedObject[]) => void
}

/**
 * Use a {@linkcode CameraObjectOutput}.
 *
 * @example
 * ```ts
 * const objectOutput = useObjectOutput({
 *   types: ['qr'],
 *   onObjectsScanned(objects) {
 *     console.log(`Scanned ${objects.length} objects!`)
 *   }
 * })
 * ```
 */
export function useObjectOutput({
  types,
  onObjectsScanned,
}: UseObjectOutputProps): CameraObjectOutput {
  // 1. Create object output
  const objectOutput = useMemo(
    () =>
      VisionCamera.createObjectOutput({
        enabledObjectTypes: types,
      }),
    [types],
  )
  // 2. Update onObjectsScanned() callback if it changed
  useEffect(() => {
    objectOutput.setOnObjectsScannedCallback(onObjectsScanned)
    return () => {
      objectOutput.setOnObjectsScannedCallback(undefined)
    }
  }, [objectOutput, onObjectsScanned])

  // 3. Return :)
  return objectOutput
}
