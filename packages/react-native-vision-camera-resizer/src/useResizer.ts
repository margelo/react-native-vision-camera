import { useEffect, useState } from 'react'
import type { Frame } from 'react-native-vision-camera'
import { createResizer } from './createResizer'
import type { Resizer } from './specs/Resizer.nitro'
import type { ResizerOptions } from './specs/ResizerFactory.nitro'

/**
 * The current state of the {@linkcode useResizer} hook.
 * - `'loading'`: The {@linkcode Resizer} is still being created.
 * - `'ready'`: The {@linkcode Resizer} has been created successfully and is ready to use.
 * - `'error'`: Creating the {@linkcode Resizer} failed. Inspect `error` for details.
 */
export type ResizerState =
  | { state: 'loading'; resizer: undefined; error: undefined }
  | { state: 'ready'; resizer: Resizer; error: undefined }
  | { state: 'error'; resizer: undefined; error: Error }

/**
 * Use a {@linkcode Resizer} with the given options.
 *
 * The {@linkcode Resizer} can be used to resize and convert
 * {@linkcode Frame}s for ML processing.
 *
 * @discussion
 * Inspect the returned `error` if the {@linkcode Resizer}
 * couldn't be created successfully.
 *
 * @example
 * ```ts
 * function App() {
 *   const { resizer } = useResizer({
 *     width: 192,
 *     height: 192,
 *     channelOrder: 'rgb',
 *     dataType: 'float32',
 *     scaleMode: 'cover',
 *     pixelLayout: 'planar',
 *   })
 *
 *   const frameOutput = useFrameOutput({
 *     pixelFormat: 'yuv',
 *     onFrame(frame) {
 *       'worklet'
 *       if (resizer != null) {
 *         const resized = resizer.resize(frame)
 *         const buffer = resized.getPixelBuffer()
 *         resized.dispose()
 *       }
 *       frame.dispose()
 *     }
 *   })
 * }
 * ```
 */
export function useResizer({
  height,
  width,
  channelOrder,
  dataType,
  scaleMode,
  pixelLayout,
  downscaleFilter,
}: ResizerOptions): ResizerState {
  const [state, setState] = useState<ResizerState>({
    state: 'loading',
    resizer: undefined,
    error: undefined,
  })

  useEffect(() => {
    let isCanceled = false
    const load = async () => {
      try {
        const resizer = await createResizer({
          width: width,
          height: height,
          channelOrder: channelOrder,
          dataType: dataType,
          scaleMode: scaleMode,
          pixelLayout: pixelLayout,
          downscaleFilter: downscaleFilter,
        })
        if (isCanceled) return
        setState({ state: 'ready', resizer: resizer, error: undefined })
      } catch (error) {
        setState({ state: 'error', resizer: undefined, error: error as Error })
      }
    }
    load()
    return () => {
      isCanceled = true
    }
  }, [
    channelOrder,
    dataType,
    downscaleFilter,
    height,
    pixelLayout,
    scaleMode,
    width,
  ])

  return state
}
