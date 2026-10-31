import type { HybridObject } from 'react-native-nitro-modules'
import type { CameraOutput } from 'react-native-vision-camera'
import type { Barcode } from './Barcode.nitro'
import type { TargetBarcodeFormat } from './BarcodeFormat'
import type { BarcodeScanner } from './BarcodeScanner.nitro'
import type { BarcodeScannerOutputResolution } from './BarcodeScannerOutputResolution'

export interface BarcodeScannerOptions {
  /**
   * Specifies the formats to be used for Barcode
   * scanning.
   *
   * If you want to detect all kinds of barcodes,
   * use {@linkcode TargetBarcodeFormat | ['all-formats']}
   */
  barcodeFormats: TargetBarcodeFormat[]
}

export interface BarcodeScannerOutputOptions {
  /**
   * Specifies the formats to be used for Barcode
   * scanning.
   *
   * If you want to detect all kinds of barcodes,
   * use {@linkcode TargetBarcodeFormat | ['all-formats']}
   */
  barcodeFormats: TargetBarcodeFormat[]
  /**
   * Controls which camera buffer resolution should be used.
   *
   * - `'preview'`: Prefer preview-sized buffers for lower latency.
   * - `'full'`: Prefer full/highest available buffers for better detail.
   *
   * @default 'preview'
   */
  outputResolution?: BarcodeScannerOutputResolution
  /**
   * The maximum zoom ratio of the Camera this output is attached to.
   * Zoom suggestions from {@linkcode onZoomSuggested} never exceed it.
   * If omitted, ML Kit may suggest an unbounded ratio.
   *
   * @platform Android
   */
  maxZoomRatio?: number
  /**
   * Called when a barcode has been detected but is too far away
   * to be decoded. Apply the suggested `zoomRatio` to the Camera's
   * `zoom` to make it decodable.
   *
   * @platform Android
   * @note iOS does not support zoom suggestions, as MLKit on iOS
   * does not provide them.
   */
  onZoomSuggested?: (zoomRatio: number) => void
  /**
   * Called whenever barcodes have been detected.
   */
  onBarcodeScanned: (barcodes: Barcode[]) => void
  /**
   * Called when there was an error detecting barcodes.
   */
  onError: (error: Error) => void
}

export interface BarcodeScannerFactory
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /**
   * Create a new {@linkcode BarcodeScanner}.
   */
  createBarcodeScanner(options: BarcodeScannerOptions): BarcodeScanner

  // TODO: Nitro does not support external inheritance in Swift yet, so
  //       we cannot have a custom HybridObject that extends CameraOutput.
  //       Once Nitro supports this, we can return a concrete type here.
  /**
   * Create a new {@linkcode CameraOutput} that can
   * detect Barcodes.
   */
  createBarcodeScannerOutput(options: BarcodeScannerOutputOptions): CameraOutput
}
