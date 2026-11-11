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
  /**
   * Also return Barcodes that were located, but could not be decoded.
   *
   * On such a {@linkcode Barcode}, {@linkcode Barcode.rawValue | rawValue}
   * and {@linkcode Barcode.rawBytes | rawBytes} are `undefined`, while
   * {@linkcode Barcode.boundingBox | boundingBox} describes the region that
   * potentially contains a Barcode.
   *
   * This distinguishes "no Barcode is in view" from "a Barcode is in view
   * that cannot be read" — two failures with opposite fixes (lighting and
   * contrast vs. zoom and distance). It can also drive the camera's zoom:
   * a code too small to decode still reports where it is.
   *
   * @note Android only — the iOS MLKit SDK exposes no equivalent option.
   * @default false
   */
  enableAllPotentialBarcodes?: boolean
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
   * Also return Barcodes that were located, but could not be decoded.
   *
   * On such a {@linkcode Barcode}, {@linkcode Barcode.rawValue | rawValue}
   * and {@linkcode Barcode.rawBytes | rawBytes} are `undefined`, while
   * {@linkcode Barcode.boundingBox | boundingBox} describes the region that
   * potentially contains a Barcode.
   *
   * This distinguishes "no Barcode is in view" from "a Barcode is in view
   * that cannot be read" — two failures with opposite fixes (lighting and
   * contrast vs. zoom and distance). It can also drive the camera's zoom:
   * a code too small to decode still reports where it is.
   *
   * @note Android only — the iOS MLKit SDK exposes no equivalent option.
   * @default false
   */
  enableAllPotentialBarcodes?: boolean
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
