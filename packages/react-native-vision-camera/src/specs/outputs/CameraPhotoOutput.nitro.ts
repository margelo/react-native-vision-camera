import type { Image } from 'react-native-nitro-image'
import type { usePhotoOutput } from '../../hooks/usePhotoOutput'
import type { CameraOrientation } from '../common-types/CameraOrientation'
import type {
  PhotoContainerFormat,
  TargetPhotoContainerFormat,
} from '../common-types/PhotoContainerFormat'
import type { QualityPrioritization } from '../common-types/QualityPrioritization'
import type { Size } from '../common-types/Size'
import type { CameraDevice } from '../inputs/CameraDevice.nitro'
import type { Photo } from '../instances/Photo.nitro'
import type { Location } from '../location/Location.nitro'
import type { CameraSession } from '../session/CameraSession.nitro'
import type { CameraSessionConfig } from '../session/CameraSessionConfig.nitro'
import type { CameraOutput } from './CameraOutput.nitro'

// TODO: Move depth data into configuration upfront, I think we need to prepare the Photo Output for that natively.
// TODO: I think there is no way to get `containerFormat` upfront - we dont know what formats are supported! We need to expose that probably via `CameraDevice.supportedPhotoContainerFormats`

/**
 * Configuration options for a {@linkcode CameraPhotoOutput}.
 *
 * @see {@linkcode CameraPhotoOutput}
 * @see {@linkcode usePhotoOutput | usePhotoOutput(...)}
 */
export interface PhotoOutputOptions {
  /**
   * The target Photo Resolution to use.
   *
   * @discussion
   * The {@linkcode CameraSession} will negotiate all
   * output {@linkcode targetResolution}s and constraints (such
   * as HDR, FPS, etc) in a {@linkcode CameraSessionConfig} to
   * finalize the Resolution used for the Output.
   * This is therefore merely a resolution _target_, and may
   * not be exactly met.
   *
   * If the given {@linkcode targetResolution} cannot be met
   * exactly, its aspect ratio (computed by
   * {@linkcode Size.width} / {@linkcode Size.height}) will
   * be prioritized over pixel count.
   */
  targetResolution: Size
  /**
   * Specifies the {@linkcode TargetPhotoContainerFormat} to
   * shoot the {@linkcode Photo} in.
   */
  containerFormat: TargetPhotoContainerFormat
  /**
   * Defines the compression quality for processed photo formats.
   *
   * The value must be within the normalized range from `0.0` to `1.0`,
   * where `1.0` is the highest quality and `0.0` is the strongest compression.
   *
   * RAW photo formats such as {@linkcode TargetPhotoContainerFormat | 'dng'}
   * ignore this option.
   *
   * @default 0.9 in {@linkcode usePhotoOutput | usePhotoOutput(...)}
   */
  quality: number
  /**
   * Specifies the balance between speed or image quality for
   * the photo capture pipeline.
   *
   * The currently selected {@linkcode CameraDevice} must support
   * {@linkcode QualityPrioritization} {@linkcode QualityPrioritization | 'speed'}
   * (see {@linkcode CameraDevice.supportsSpeedQualityPrioritization | supportsSpeedQualityPrioritization}),
   * otherwise an error will be thrown.
   *
   * @see {@linkcode CameraDevice.supportsSpeedQualityPrioritization}
   */
  qualityPrioritization: QualityPrioritization
  /**
   * When this is set to a specific {@linkcode Size},
   * a ready to display {@linkcode Image} will be delivered
   * just before the resulting {@linkcode Photo} is available.
   *
   * Preview Image delivery requires additional processing,
   * so this is disabled by default.
   *
   * If this is `undefined` (the default), no preview Image
   * will be supplied.
   *
   * It is recommended to set this to a {@linkcode Size}
   * that is as low as possible to avoid unnecessary overhead.
   *
   * @see {@linkcode CapturePhotoCallbacks.onPreviewImageAvailable}
   * @default undefined
   */
  previewImageTargetSize?: Size
}

/**
 * Callbacks for a {@linkcode CameraPhotoOutput.capturePhoto | capturePhoto(...)}
 * call.
 *
 * @see {@linkcode CameraPhotoOutput}
 */
export interface CapturePhotoCallbacks {
  /**
   * Called when the pipeline starts
   * the capture.
   */
  onWillBeginCapture?: () => void
  /**
   * Called just before the pipeline
   * starts capturing the photo.
   */
  onWillCapturePhoto?: () => void
  /**
   * Called just after the pipeline
   * captured a photo.
   */
  onDidCapturePhoto?: () => void
  /**
   * Called just after {@linkcode onWillBeginCapture}
   * with an {@linkcode Image} suitable for preview
   * or thumbnail updates.
   *
   * This will only be called if a preview image
   * size is set via {@linkcode PhotoOutputOptions.previewImageTargetSize},
   * and the {@linkcode CameraDevice} supports preview
   * images (see {@linkcode CameraDevice.supportsPreviewImage}).
   */
  onPreviewImageAvailable?: (previewImage: Image) => void
}

/**
 * Configures flash for photo capture.
 *
 * @see {@linkcode CameraPhotoOutput.capturePhoto | capturePhoto(...)}
 */
export type FlashMode = 'off' | 'on' | 'auto'

/**
 * Configuration options for a
 * {@linkcode CameraPhotoOutput.capturePhoto | capturePhoto(...)} call.
 *
 * @see {@linkcode CameraPhotoOutput}
 */
export interface CapturePhotoSettings {
  /**
   * Configures the {@linkcode FlashMode} for this Photo
   * capture.
   *
   * @throws If {@linkcode FlashMode} is `'on'`, but
   * the {@linkcode CameraDevice} does not have a
   * flash - see {@linkcode CameraDevice.hasFlash}
   * @default 'off'
   */
  flashMode?: FlashMode
  /**
   * Enables or disables the system shutter sound.
   * The shutter sound is fired exactly when a photo will be captured.
   *
   * The OS may choose to override this behaviour, e.g. if
   * regional sound-suppression settings are applied.
   *
   * @default true
   */
  enableShutterSound?: boolean
  // TODO: separate enableDepthData with embedsDepthDataInPhoto
  /**
   * Enables or disables depth data delivery in the resulting
   * {@linkcode Photo}.
   *
   * Depth data will be embedded in the Photo and can be accessed
   * via {@linkcode Photo.depth}.
   *
   * {@linkcode enableDepthData} can only be enabled if the
   * {@linkcode CameraPhotoOutput} supports depth data - see
   * {@linkcode CameraPhotoOutput.supportsDepthDataDelivery}.
   *
   * @default false
   */
  enableDepthData?: boolean
  /**
   * Specifies whether red-eye reduction should be applied
   * automatically on flash captures.
   *
   * When {@linkcode flashMode} is {@linkcode FlashMode | 'off'},
   * red eye reduction is automataically disabled.
   *
   * @default true
   */
  enableRedEyeReduction?: boolean
  /**
   * Specifies whether the capture pipeline should
   * deliver Camera calibration data.
   *
   * A {@linkcode Photo}'s calibration data can be accessed via
   * {@linkcode Photo.calibrationData | Photo.calibrationData}.
   *
   * @platform iOS
   * @default false
   */
  enableCameraCalibrationDataDelivery?: boolean
  /**
   * Specifies whether the capture pipeline should
   * automatically correct lens distortion.
   *
   * @note If enabled, captured photos will look
   * slightly different compared to the Preview
   * because the field-of-view might be narrower.
   *
   * @default false
   */
  enableDistortionCorrection?: boolean
  /**
   * Enables or disables virtual device image fusion.
   *
   * If enabled, the Camera pipeline may capture photos
   * from multiple constituent physical Camera devices at once
   * (if using a Camera device that has multiple physical devices)
   * to improve still image quality.
   *
   * When capturing RAW photos, this is disabled.
   *
   * @default true
   */
  enableVirtualDeviceFusion?: boolean
  /**
   * Sets the given {@linkcode Location} to be embedded
   * into the EXIF data of the captured {@linkcode Photo}.
   *
   * @default undefined
   */
  location?: Location
}

/**
 * Represents a Photo captured by
 * {@linkcode CameraPhotoOutput.capturePhotoToFile | capturePhotoToFile(...)}
 * and written to a File.
 */
export interface PhotoFile {
  /**
   * The path of the file.
   * This is a filesystem path, not a `file://` URL.
   */
  filePath: string
  /**
   * The width of the captured Photo, in pixels.
   */
  width: number
  /**
   * The height of the captured Photo, in pixels.
   */
  height: number
  /**
   * The {@linkcode CameraOrientation} the Photo was captured in.
   *
   * The orientation is applied lazily through the file's EXIF metadata.
   */
  orientation: CameraOrientation
  /**
   * Whether the captured Photo is mirrored along its vertical axis.
   */
  isMirrored: boolean
  /**
   * The timestamp at which the Photo was captured, using the system's
   * host clock, in seconds.
   */
  timestamp: number
  /**
   * Whether the captured Photo is a RAW photo.
   */
  isRawPhoto: boolean
  /**
   * The {@linkcode PhotoContainerFormat} of the captured Photo.
   */
  containerFormat: PhotoContainerFormat
}

/**
 * The {@linkcode CameraPhotoOutput} allows capturing {@linkcode Photo}s
 * in-memory, as well as directly to a file.
 *
 * In-memory {@linkcode Photo}s can be converted to Images for immediate
 * display, and/or saved to a file (or the media gallery) later on.
 *
 * @see {@linkcode PhotoOutputOptions}
 * @see {@linkcode CapturePhotoSettings}
 * @see {@linkcode usePhotoOutput | usePhotoOutput(...)}
 * @example
 * Creating a `CameraPhotoOutput` via the Hooks API:
 * ```ts
 * const photoOutput = usePhotoOutput()
 * ```
 *
 * @example
 * Creating a `CameraPhotoOutput` via the Imperative API:
 * ```ts
 * const photoOutput = VisionCamera.createPhotoOutput({
 *   targetResolution: CommonResolutions.UHD_4_3,
 *   containerFormat: 'native',
 *   quality: 0.9,
 *   qualityPrioritization: 'balanced',
 * })
 * ```
 */
export interface CameraPhotoOutput extends CameraOutput {
  /**
   * Get whether this {@linkcode CameraPhotoOutput} supports
   * capturing depth data alongside with a normal {@linkcode Photo},
   * e.g. for portrait effects matte.
   * @see {@linkcode CapturePhotoSettings.enableDepthData}
   */
  readonly supportsDepthDataDelivery: boolean
  /**
   * get whether this {@linkcode CameraPhotoOutput} supports
   * delivering camera calibration data, e.g. for reconstructing
   * lens-distortion or geometry.
   * @see {@linkcode CapturePhotoSettings.enableCameraCalibrationDataDelivery}
   */
  readonly supportsCameraCalibrationDataDelivery: boolean
  // TODO: Add prepareSettings(...)

  /**
   * Captures a {@linkcode Photo} using the given
   * {@linkcode CapturePhotoSettings}.
   *
   * @note
   * On Android, it is recommended to use
   * {@linkcode capturePhoto | capturePhoto(...)} only
   * for {@linkcode TargetPhotoContainerFormat | 'jpeg'} images, and use
   * {@linkcode capturePhotoToFile | capturePhotoToFile(...)}
   * for any other formats (such as RAW ({@linkcode TargetPhotoContainerFormat | 'dng'}),
   * as CameraX does not properly support in-memory Photos for formats like RAW yet.
   * See https://issuetracker.google.com/u/3/issues/482079661 for more information.
   *
   * @note
   * The {@linkcode Photo} has to be `dispose()`'d after it
   * is no longer used, as otherwise the JS Runtime might not
   * immediately delete it, possibly exhausting system resources.
   *
   * @example
   * ```ts
   * const photo = await photoOutput.capturePhoto(
   *   { flashMode: 'on' },
   *   {}
   * )
   * // ...
   * photo.dispose()
   * ```
   */
  capturePhoto(
    settings: CapturePhotoSettings,
    callbacks: CapturePhotoCallbacks,
  ): Promise<Photo>

  /**
   * Captures a Photo and writes it to a temporary file
   * using the given {@linkcode CapturePhotoSettings}.
   * @example
   * ```ts
   * const photoFile = await photoOutput.capturePhotoToFile(
   *   { flashMode: 'on' },
   *   {}
   * )
   * ```
   */
  capturePhotoToFile(
    settings: CapturePhotoSettings,
    callbacks: CapturePhotoCallbacks,
  ): Promise<PhotoFile>

  /**
   * Asynchronously prepares the {@linkcode CameraPhotoOutput}
   * with the given {@linkcode settings} array to improve capture
   * responsiveness for subsequent {@linkcode capturePhoto | capturePhoto(...)}
   * calls when called with any of the same {@linkcode CapturePhotoSettings}
   * that have been prepared via this method.
   *
   * @discussion
   * It is recommended to always call this with a few common
   * settings you expect to be used for {@linkcode capturePhoto | capturePhoto(...)}
   * later on.
   *
   * It is perfectly fine to not call {@linkcode prepareSettings | prepareSettings(...)}
   * when using Photo capture, but {@linkcode capturePhoto | capturePhoto(...)} may
   * allocate buffers that cause higher latency on initial calls when aiming for quality.
   *
   * On Android, this method is no-op.
   *
   * @example
   * ```ts
   * const photoOutput = usePhotoOutput({})
   *
   * useEffect(() => {
   *   photoOutput.prepareSettings([
   *     { flashMode: 'off', enableDistortionCorrection: true },
   *     { flashMode: 'on', enableDistortionCorrection: false },
   *   ])
   * }, [])
   * ```
   */
  prepareSettings(settings: CapturePhotoSettings[]): Promise<void>
}
