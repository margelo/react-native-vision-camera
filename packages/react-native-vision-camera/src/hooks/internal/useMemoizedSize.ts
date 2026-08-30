import { useMemo } from 'react'
import type { Size } from '../../specs/common-types/Size'
import type { CameraOutput } from '../../specs/outputs/CameraOutput.nitro'
import type { CameraSession } from '../../specs/session/CameraSession.nitro'

/**
 * Memoizes the given {@linkcode Size} by value instead of by identity.
 *
 * {@linkcode Size}s are usually written as inline object literals
 * (e.g. `useVideoOutput({ targetResolution: { width: 1920, height: 1080 } })`),
 * which allocates a new object on every render. Using such a {@linkcode Size}
 * as a `useMemo` dependency would re-create the {@linkcode CameraOutput} on
 * every render, and re-creating an output re-configures the
 * {@linkcode CameraSession} - which renders again, which re-creates the
 * output again, and so on.
 */
export function useMemoizedSize(size: Size): Size
export function useMemoizedSize(size: Size | undefined): Size | undefined
export function useMemoizedSize(size: Size | undefined): Size | undefined {
  const width = size?.width
  const height = size?.height

  return useMemo(() => {
    if (width == null || height == null) return undefined
    return { width: width, height: height }
  }, [width, height])
}
