import React, {
  type Ref,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react'
import type { ViewProps } from 'react-native'
import { callback } from 'react-native-nitro-modules'
import type { SharedValue } from 'react-native-reanimated'
import { useGestureControllers } from '../hooks/internal/useGestureControllers'
import { type CameraProps, useCamera } from '../hooks/useCamera'
import { usePreviewOutput } from '../hooks/usePreviewOutput'
import type { CameraController } from '../specs/CameraController.nitro'
import type {
  FocusOptions,
  MeteringMode,
} from '../specs/common-types/FocusOptions'
import type { Point } from '../specs/common-types/Point'
import type { Size } from '../specs/common-types/Size'
import type { PreviewConfiguration } from '../specs/outputs/CameraPreviewOutput.nitro'
import type {
  PreviewView,
  PreviewViewMethods,
  PreviewViewProps,
} from '../specs/views/PreviewView.nitro'
import { getUprightPreviewResolution } from '../utils/getUprightPreviewResolution'
import { NativePreviewView } from './NativePreviewView'

/**
 * A React-ref to the {@linkcode Camera} view.
 * @example
 * ```tsx
 * function App() {
 *   const camera = useRef<CameraRef>(null)
 *   return <Camera {...props} ref={camera} />
 * }
 * ```
 */
export interface CameraRef
  extends PreviewViewMethods,
    Pick<
      CameraController,
      'resetFocus' | 'startZoomAnimation' | 'cancelZoomAnimation'
    > {
  /**
   * Focuses the Camera pipeline to the specified {@linkcode viewPoint}
   * relative to the Camera view's coordinate system using
   * the specified {@linkcode MeteringMode}s.
   * @param viewPoint The point in the view coordinate system to focus to.
   * @param options Options for the focus operation.
   * @throws If the Camera isn't ready yet.
   * @example
   * ```tsx
   * // Focus center
   * await camera.current.focusTo({ x: width / 2, y: height / 2 })
   * ```
   */
  focusTo(viewPoint: Point, options?: FocusOptions): Promise<void>

  /**
   * Get the current {@linkcode CameraController}.
   * This property will be set after `onStarted`
   * has been called, and may change over time.
   */
  controller: CameraController | undefined
  /**
   * Get a ref to the {@linkcode PreviewView},
   * or `undefined` if it has not yet been set.
   * This value is set after the first
   * mount, and usually won't change.
   */
  preview: PreviewView | undefined
}

/**
 * Props for the {@linkcode Camera} component.
 *
 * Extends {@linkcode CameraProps} (the options for the underlying
 * {@linkcode useCamera} hook) with {@linkcode PreviewView}-specific options
 * and convenience props for gesture handling and animated values.
 */
export interface CameraViewProps
  extends CameraProps,
    Pick<ViewProps, 'style' | 'onLayout' | 'pointerEvents' | 'nativeID'>,
    Pick<PreviewViewProps, 'resizeMode' | 'implementationMode'> {
  // PreviewView props
  /**
   * Called when the {@linkcode Camera}'s Preview
   * received its first Frame.
   */
  onPreviewStarted?: () => void
  /**
   * Called when the {@linkcode Camera}'s Preview
   * stopped streaming Frames.
   */
  onPreviewStopped?: () => void
  /**
   * Called whenever the Preview's resolution or rotation changes.
   */
  onPreviewConfigurationChanged?: (configuration: PreviewConfiguration) => void
  /**
   * Called when the Preview's upright stream resolution becomes available or
   * changes.
   *
   * The callback receives the Preview stream's dimensions in upright pixels.
   * Its `width` and `height` are ready to use for upright layout calculations.
   *
   * This describes the camera content, not the size of the React Native
   * `<Camera>` view. It can be used directly to calculate the Preview's
   * upright aspect ratio:
   *
   * ```ts
   * onPreviewResolution={({ width, height }) => {
   *   setPreviewAspectRatio(width / height)
   * }}
   * ```
   *
   * Use {@linkcode onPreviewConfigurationChanged} instead when the complete,
   * lower-level Preview configuration needs to be inspected.
   *
   * On iOS, this callback is available on iOS 17.0 and newer. It is not called
   * on earlier iOS versions. Android is supported on all versions.
   */
  onPreviewResolution?: (resolution: Size) => void
  /**
   * The preferred Preview resolution. Negotiated with the other
   * outputs, so the resulting resolution may differ.
   *
   * Mainly meant for Android. On iOS, leave this unset and use a
   * `resolutionBias` constraint instead.
   *
   * When omitted, the platform's default Preview resolution preference is used.
   */
  previewTargetResolution?: Size

  // Native gestures
  /**
   * Enables (or disables) the native pinch-to-zoom gesture.
   *
   * @throws If this property is enabled and {@linkcode CameraViewProps.zoom | zoom} is not `undefined`.
   * @default false
   */
  enableNativeZoomGesture?: boolean
  /**
   * Enables (or disables) the native tap-to-focus gesture.
   *
   * @default false
   */
  enableNativeTapToFocusGesture?: boolean

  // Ref Wrapper
  /**
   * @see {@linkcode CameraRef}
   */
  ref?: Ref<CameraRef>
}

function CameraImpl({
  implementationMode,
  resizeMode,
  onPreviewStarted,
  onPreviewStopped,
  onPreviewConfigurationChanged,
  onPreviewResolution,
  previewTargetResolution,
  outputs = [],
  enableNativeZoomGesture = false,
  enableNativeTapToFocusGesture = false,
  ref,
  ...props
}: CameraViewProps): React.ReactElement {
  const onConfigurationChanged = useCallback(
    (configuration: PreviewConfiguration) => {
      onPreviewConfigurationChanged?.(configuration)

      const resolution = getUprightPreviewResolution(configuration)
      if (resolution != null) {
        onPreviewResolution?.(resolution)
      }
    },
    [onPreviewConfigurationChanged, onPreviewResolution],
  )

  // 1. Create `PreviewOutput` for the Camera
  const previewOutput = usePreviewOutput({
    targetResolution: previewTargetResolution,
    onConfigurationChanged,
  })

  // 3. Create session/controller and add the preview output
  const controller = useCamera({
    ...props,
    outputs: [previewOutput, ...outputs],
  })

  // 4. Create `ref` for `PreviewView`
  const previewViewRef = useRef<PreviewView>(null)
  const setHybridRef = useMemo(
    () =>
      callback((r: PreviewView) => {
        previewViewRef.current = r
      }),
    [],
  )

  // 5. Create a ref that exposes some funcs on the Controller and the PreviewView.
  useImperativeHandle(
    ref,
    () => ({
      startZoomAnimation(zoom, rate) {
        if (controller == null) throw new Error(`Camera is not yet ready!`)
        return controller.startZoomAnimation(zoom, rate)
      },
      cancelZoomAnimation() {
        if (controller == null) throw new Error(`Camera is not yet ready!`)
        return controller.cancelZoomAnimation()
      },
      async focusTo(viewPoint, options = {}) {
        if (controller == null) throw new Error(`Camera is not yet ready!`)
        if (previewViewRef.current == null)
          throw new Error(`Camera Preview is not yet ready!`)
        const meteringPoint = previewViewRef.current.createMeteringPoint(
          viewPoint.x,
          viewPoint.y,
        )
        await controller.focusTo(meteringPoint, options)
      },
      async resetFocus() {
        if (controller == null) throw new Error(`Camera is not yet ready!`)
        await controller.resetFocus()
      },
      createMeteringPoint(x, y, size) {
        if (previewViewRef.current == null)
          throw new Error(`Camera Preview is not yet ready!`)
        return previewViewRef.current.createMeteringPoint(x, y, size)
      },
      takeSnapshot() {
        if (previewViewRef.current == null)
          throw new Error(`Camera Preview is not yet ready!`)
        return previewViewRef.current.takeSnapshot()
      },
      convertCameraPointToViewPoint(cameraPoint) {
        if (previewViewRef.current == null)
          throw new Error(`Camera Preview is not yet ready!`)
        return previewViewRef.current.convertCameraPointToViewPoint(cameraPoint)
      },
      convertViewPointToCameraPoint(viewPoint) {
        if (previewViewRef.current == null)
          throw new Error(`Camera Preview is not yet ready!`)
        return previewViewRef.current.convertViewPointToCameraPoint(viewPoint)
      },
      convertScannedObjectCoordinatesToViewCoordinates(scannedObject) {
        if (previewViewRef.current == null)
          throw new Error(`Camera Preview is not yet ready!`)
        return previewViewRef.current.convertScannedObjectCoordinatesToViewCoordinates(
          scannedObject,
        )
      },
      get controller(): CameraController | undefined {
        return controller
      },
      get preview(): PreviewView | undefined {
        return previewViewRef.current ?? undefined
      },
    }),
    [controller],
  )

  // 7. Attach any native gesture controllers
  if (enableNativeZoomGesture && props.zoom != null) {
    throw new Error(
      `\`zoom\` must not be set if \`enableNativeZoomGesture\` is enabled!`,
    )
  }
  const gestureControllers = useGestureControllers({
    controller: controller,
    enableNativeZoomGesture: enableNativeZoomGesture,
    enableNativeTapToFocusGesture: enableNativeTapToFocusGesture,
  })

  // 8. Render view
  return (
    <NativePreviewView
      {...props}
      implementationMode={implementationMode}
      resizeMode={resizeMode}
      gestureControllers={gestureControllers}
      // TODO: Memoize?
      onPreviewStarted={callback(onPreviewStarted)}
      onPreviewStopped={callback(onPreviewStopped)}
      hybridRef={setHybridRef}
      previewOutput={previewOutput}
    />
  )
}

/**
 * The `<Camera />` component.
 *
 * This is a convenience wrapper around {@linkcode useCamera | useCamera(...)}
 * that adds a {@linkcode PreviewView}, wraps methods in a {@linkcode CameraRef},
 * and supports updating {@linkcode CameraViewProps.zoom | zoom} and
 * {@linkcode CameraViewProps.exposure | exposure} via
 * Reanimated {@linkcode SharedValue}s.
 *
 * @example
 * ```tsx
 * function App() {
 *   const camera = useRef<CameraRef>(null)
 *   const device = useCameraDevice('back')
 *   const photoOutput = usePhotoOutput()
 *
 *   return (
 *     <Camera
 *       style={StyleSheet.absoluteFill}
 *       ref={camera}
 *       device={device}
 *       outputs={[photoOutput]}
 *       isActive={true}
 *     />
 *   )
 * }
 * ```
 */
export const Camera = React.memo(CameraImpl)
