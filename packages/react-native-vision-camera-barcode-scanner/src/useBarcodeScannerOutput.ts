import { useMemo, useRef } from 'react'
import type {
  Camera,
  CameraOutput,
  CameraSession,
} from 'react-native-vision-camera'
import { createBarcodeScannerOutput } from './factory'
import type { BarcodeScannerOutputOptions } from './specs/BarcodeScannerFactory.nitro'

/**
 * Use a Barcode Scanner {@linkcode CameraOutput}.
 *
 * The Barcode Scanner {@linkcode CameraOutput} can be
 * attached to a {@linkcode CameraSession} or {@linkcode Camera}
 * component.
 *
 * @example
 * Attach to a `<Camera />` component:
 * ```tsx
 * const device = ...
 * const scannerOutput = useBarcodeScannerOutput({
 *   barcodeFormats: ['all-formats'],
 *   onBarcodeScanned(barcodes) {
 *     console.log(`Scanned ${barcodes.length} barcodes!`)
 *   },
 *   onError(error) {
 *     console.error(`Failed to scan barcodes!`, error)
 *   },
 *   maxZoomRatio: device.maxZoom,
 *   onZoomSuggested(zoomRatio) {
 *     // Android only - apply to the Camera's `zoom`
 *     setZoom(zoomRatio)
 *   }
 * })
 *
 * return (
 *   <Camera
 *     isActive={true}
 *     device={device}
 *     outputs={[scannerOutput]}
 *   />
 * )
 * ```
 * @example
 * Attach to a `CameraSession`:
 * ```ts
 * const device = ...
 * const scannerOutput = useBarcodeScannerOutput({
 *   barcodeFormats: ['all-formats'],
 *   onBarcodeScanned(barcodes) {
 *     console.log(`Scanned ${barcodes.length} barcodes!`)
 *   },
 *   onError(error) {
 *     console.error(`Failed to scan barcodes!`, error)
 *   }
 * })
 * const camera = useCamera({
 *   isActive: true,
 *   device: device,
 *   outputs: [scannerOutput]
 * })
 * ```
 */
export function useBarcodeScannerOutput({
  barcodeFormats,
  outputResolution = 'preview',
  maxZoomRatio,
  onBarcodeScanned,
  onError,
  onZoomSuggested,
}: BarcodeScannerOutputOptions): CameraOutput {
  const stableOnBarcodeScanned = useRef(onBarcodeScanned)
  stableOnBarcodeScanned.current = onBarcodeScanned

  const stableOnError = useRef(onError)
  stableOnError.current = onError

  const stableOnZoomSuggested = useRef(onZoomSuggested)
  stableOnZoomSuggested.current = onZoomSuggested
  const hasZoomSuggestions = onZoomSuggested != null

  return useMemo(
    () =>
      createBarcodeScannerOutput({
        barcodeFormats: barcodeFormats,
        outputResolution: outputResolution,
        maxZoomRatio: maxZoomRatio,
        onBarcodeScanned(barcodes) {
          stableOnBarcodeScanned.current(barcodes)
        },
        onError(error) {
          stableOnError.current(error)
        },
        onZoomSuggested: hasZoomSuggestions
          ? (zoomRatio) => {
              stableOnZoomSuggested.current?.(zoomRatio)
            }
          : undefined,
      }),
    [barcodeFormats, outputResolution, maxZoomRatio, hasZoomSuggestions],
  )
}
