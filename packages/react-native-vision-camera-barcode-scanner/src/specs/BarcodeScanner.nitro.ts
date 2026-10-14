import type { Image } from 'react-native-nitro-image'
import type { HybridObject } from 'react-native-nitro-modules'
import type { Frame, PreviewViewMethods } from 'react-native-vision-camera'
import type { createBarcodeScanner } from '../factory'
import type { useBarcodeScanner } from '../useBarcodeScanner'
import type { Barcode } from './Barcode.nitro'

/**
 * Represents a Barcode Scanner that uses MLKit Barcodes.
 *
 * The {@linkcode BarcodeScanner} can be used in a
 * Frame Processor by calling {@linkcode BarcodeScanner.scanCodes | scanCodes(...)},
 * or for static images by calling
 * {@linkcode BarcodeScanner.scanCodesInImage | scanCodesInImage(...)} or
 * {@linkcode BarcodeScanner.scanCodesInImageAsync | scanCodesInImageAsync(...)}.
 *
 * @see {@linkcode useBarcodeScanner | useBarcodeScanner(...)}
 * @see {@linkcode createBarcodeScanner | createBarcodeScanner(...)}
 */
export interface BarcodeScanner
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /**
   * Synchronously detects {@linkcode Barcode}s in the
   * given {@linkcode Frame}.
   *
   * All coordinates in the {@linkcode Barcode} are
   * relative to the {@linkcode Frame}'s coordinate system.
   *
   * You can convert {@linkcode Barcode} coordinates to Camera coordinates using
   * {@linkcode Frame.convertFramePointToCameraPoint | Frame.convertFramePointToCameraPoint(...)},
   * and then convert the Camera coordinates to Preview View coordinates using
   * {@linkcode PreviewViewMethods.convertCameraPointToViewPoint | PreviewViewMethods.convertCameraPointToViewPoint(...)}.
   *
   * @example
   * ```ts
   * const scanner = // ...
   * const frame = // ...
   * const previewView = // ...
   *
   * const barcodes = scanner.scanCodes(frame)
   * for (const barcode of barcodes) {
   *   console.log('Barcode value:', barcode.rawValue)
   *   for (const point of barcode.cornerPoints) {
   *     const cameraPoint = frame.convertFramePointToCameraPoint(point)
   *     const previewPoint = previewView.convertCameraPointToViewPoint(cameraPoint)
   *     console.log('Corner Point:', previewPoint)
   *   }
   * }
   * ```
   */
  scanCodes(frame: Frame): Barcode[]
  /**
   * Asynchronously detects {@linkcode Barcode}s in the
   * given {@linkcode Frame}.
   *
   * The Frame must remain valid until the returned Promise settles. Do not
   * call {@linkcode Frame.dispose | Frame.dispose()} before awaiting it.
   *
   * @see {@linkcode scanCodes}
   */
  scanCodesAsync(frame: Frame): Promise<Barcode[]>

  /**
   * Synchronously detects {@linkcode Barcode}s in the
   * given {@linkcode Image}.
   *
   * This can be used to scan codes in an existing still image, such as
   * an image loaded from disk, bundled resources or a URL via
   * `react-native-nitro-image`.
   *
   * All coordinates in the returned {@linkcode Barcode}s are relative
   * to the given {@linkcode Image}'s coordinate system.
   *
   * @see {@linkcode scanCodesInImageAsync}
   */
  scanCodesInImage(image: Image): Barcode[]

  /**
   * Asynchronously detects {@linkcode Barcode}s in the
   * given {@linkcode Image}.
   *
   * This can be used to scan codes in an existing still image, such as
   * an image loaded from disk, bundled resources or a URL via
   * `react-native-nitro-image`.
   *
   * All coordinates in the returned {@linkcode Barcode}s are relative
   * to the given {@linkcode Image}'s coordinate system.
   *
   * @example
   * ```ts
   * import { loadImage } from 'react-native-nitro-image'
   * import { createBarcodeScanner } from 'react-native-vision-camera-barcode-scanner'
   *
   * const image = await loadImage({ url: 'https://example.com/barcode.png' })
   * const scanner = createBarcodeScanner({ barcodeFormats: ['all-formats'] })
   *
   * try {
   *   const barcodes = await scanner.scanCodesInImageAsync(image)
   *   console.log('Barcode value:', barcodes[0]?.rawValue)
   * } finally {
   *   image.dispose()
   *   scanner.dispose()
   * }
   * ```
   *
   * @see {@linkcode scanCodesInImage}
   */
  scanCodesInImageAsync(image: Image): Promise<Barcode[]>
}
