import type { Image } from 'react-native-nitro-image'
import type { HybridObject } from 'react-native-nitro-modules'
import type {
  CameraController,
  CameraControllerConfiguration,
} from '../CameraController.nitro'
import type { CameraPosition } from '../common-types/CameraPosition'
import type {
  Constraint,
  FPSConstraint,
  PhotoHDRConstraint,
  PreviewStabilizationModeConstraint,
  ResolutionBiasConstraint,
  VideoDynamicRangeConstraint,
  VideoStabilizationModeConstraint,
} from '../common-types/Constraint'
import type { DeviceType } from '../common-types/DeviceType'
import type { DynamicRange } from '../common-types/DynamicRange'
import type { MeteringMode } from '../common-types/FocusOptions'
import type { MediaType } from '../common-types/MediaType'
import type { OutputStreamType } from '../common-types/OutputStreamType'
import type { PixelFormat } from '../common-types/PixelFormat'
import type { QualityPrioritization } from '../common-types/QualityPrioritization'
import type { Range } from '../common-types/Range'
import type { Size } from '../common-types/Size'
import type {
  StabilizationMode,
  TargetStabilizationMode,
} from '../common-types/StabilizationMode'
import type { WhiteBalanceGains } from '../common-types/WhiteBalanceGains'
import type { Photo } from '../instances/Photo.nitro'
import type {
  CameraDepthFrameOutput,
  DepthFrameOutputOptions,
} from '../outputs/CameraDepthFrameOutput.nitro'
import type { FrameOutputOptions } from '../outputs/CameraFrameOutput.nitro'
import type { CameraOutput } from '../outputs/CameraOutput.nitro'
import type {
  CameraPhotoOutput,
  CapturePhotoCallbacks,
  CapturePhotoSettings,
  PhotoOutputOptions,
} from '../outputs/CameraPhotoOutput.nitro'
import type { CameraPreviewOutput } from '../outputs/CameraPreviewOutput.nitro'
import type {
  CameraVideoOutput,
  VideoOutputOptions,
} from '../outputs/CameraVideoOutput.nitro'
import type { CameraSession } from '../session/CameraSession.nitro'
import type { CameraSessionConfig } from '../session/CameraSessionConfig.nitro'

/**
 * The {@linkcode CameraDevice} represents a physical- or
 * virtual Camera Device.
 *
 * Examples:
 * - Physical: The 0.5x ultra-wide-angle Camera
 * - Virtual: The Triple-Camera consisting of the 0.5x, the 1x, and the 3x Camera
 * - TrueDepth Face ID: A virtual Camera consisting of a color, and a depth Camera
 */
export interface CameraDevice
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  // pragma MARK: Device Metadata
  /**
   * A unique identifier for this camera device.
   */
  readonly id: string
  /**
   * The model identifier for this camera device.
   */
  readonly modelID: string
  /**
   * A user friendly camera name shown by the system.
   */
  readonly localizedName: string
  /**
   * The hardware manufacturer name for this device.
   */
  readonly manufacturer: string
  /**
   * The camera hardware type, for example
   * {@linkcode DeviceType | 'wide-angle'}.
   */
  readonly type: DeviceType
  /**
   * The position of this camera on the device.
   */
  readonly position: CameraPosition
  /**
   * If this {@linkcode CameraDevice} is a virtual
   * device (see {@linkcode isVirtualDevice}), this
   * property contains a list of all constituent
   * physical devices this virtual device is made of.
   *
   * For physical devices, this returns an empty array.
   */
  readonly physicalDevices: CameraDevice[]
  /**
   * Gets whether this {@linkcode CameraDevice}
   * is a virtual device, which consists of two or
   * more physical {@linkcode CameraDevice}s.
   *
   * Devices like the "Triple-Camera" (0.5x + 1x + 3x)
   * or the "FaceID Camera" (color + depth) are virtual
   * devices.
   *
   * To access the individual physical devices
   * a virtual device consists of, use {@linkcode physicalDevices}.
   */
  readonly isVirtualDevice: boolean

  // pragma MARK: Output Capabilities
  /**
   * Get a list of all supported {@linkcode PixelFormat}s this
   * {@linkcode CameraDevice} can stream in.
   */
  readonly supportedPixelFormats: PixelFormat[]

  /**
   * Get a list of all supported resolutions this {@linkcode CameraDevice}
   * can produce for outputs of the given {@linkcode OutputStreamType}.
   *
   * If a given {@linkcode OutputStreamType} can not be streamed to at
   * all, an empty array (`[]`) will be returned.
   *
   * @discussion
   * While a {@linkcode CameraDevice} may be able to stream in the
   * given output resolutions individually, it is not guaranteed that
   * all resolutions are available when streaming to multiple
   * {@linkcode CameraOutput} with multiple {@linkcode Constraint}s
   * enabled.
   *
   * The {@linkcode CameraSession} internally negotiates available
   * output resolutions based on {@linkcode Constraint}s, and potentially
   * downgrades (or upgrades) target resolutions if needed.
   *
   * @see {@linkcode VideoOutputOptions.targetResolution}
   * @see {@linkcode PhotoOutputOptions.targetResolution}
   * @see {@linkcode FrameOutputOptions.targetResolution}
   * @see {@linkcode DepthFrameOutputOptions.targetResolution}
   * @see {@linkcode ResolutionBiasConstraint}
   *
   * @example
   * Get all resolutions for Photo capture:
   * ```ts
   * const device = ...
   * const resolutions = device.getSupportedResolutions('photo')
   * ```
   */
  getSupportedResolutions(outputStreamType: OutputStreamType): Size[]

  /**
   * Returns whether this {@linkcode CameraDevice}
   * supports streaming to the given {@linkcode output}.
   *
   * @discussion
   * Usually, a {@linkcode CameraDevice} can stream to all
   * {@linkcode CameraOutput}s, with very rare exceptions.
   *
   * For example, Depth Frame Outputs ({@linkcode CameraDepthFrameOutput})
   * may not be supported on all {@linkcode CameraDevice}s - see
   * {@linkcode mediaTypes}.
   */
  supportsOutput(output: CameraOutput): boolean

  // pragma MARK: Capabilities
  /**
   * Gets whether this {@linkcode CameraDevice}
   * supports capturing Photos in High Dynamic Range (HDR).
   *
   * @discussion
   * Photo HDR captures multiple images in various
   * exposure settings (often one under-exposed, one
   * over-exposed and one perfectly exposed), and fuses
   * the images together into a single image with a wider
   * range of colors, which results in darker blacks and
   * brighter whites.
   *
   * @discussion
   * While a device may support Photo HDR individually,
   * it is not guaranteed to be supported with all
   * possible feature and output combinations.
   *
   * The {@linkcode Constraint} API (specifically {@linkcode PhotoHDRConstraint})
   * internally negotiates the target Photo HDR preference with
   * other enabled features (such as {@linkcode ResolutionBiasConstraint})
   * and all connected {@linkcode CameraOutput}s to find a best-matching
   * supported combination on this device.
   *
   * Alternatively, to find out if a specific combination is supported upfront,
   * use the {@linkcode isSessionConfigSupported | isSessionConfigSupported(...)}
   * method with your desired outputs and constraints applied.
   *
   * @see {@linkcode PhotoHDRConstraint.photoHDR}
   * @see {@linkcode CameraPhotoOutput}
   */
  readonly supportsPhotoHDR: boolean

  /**
   * Get a list of all {@linkcode DynamicRange}s this
   * {@linkcode CameraDevice} supports streaming at,
   * often affecting both Video recordings and Preview.
   *
   * @discussion
   * Unlike Photo HDR, Video Dynamic Ranges are not
   * only extra processing, but often entirely different
   * sensor readouts.
   * While Photo HDR might capture multiple bracketed Photos
   * to fuse them together to expose more colors, Video
   * Dynamic Ranges sometimes stream in an entirely different
   * Pixel Format (e.g. 10-bit instead of 8-bit), and use
   * a different YUV Transfer Matrix to compose pixels from
   * sensor data.
   *
   * @discussion
   * While a device may support a given {@linkcode DynamicRange}
   * individually, it is not guaranteed to be supported with all
   * possible feature and output combinations.
   *
   * The {@linkcode Constraint} API (specifically {@linkcode VideoDynamicRangeConstraint})
   * internally negotiates the target Dynamic Range with
   * other enabled features (such as {@linkcode ResolutionBiasConstraint} or
   * {@linkcode FPSConstraint}) and all connected {@linkcode CameraOutput}s
   * to find a best-matching supported combination on this device.
   *
   * Alternatively, to find out if a specific combination is supported upfront,
   * use the {@linkcode isSessionConfigSupported | isSessionConfigSupported(...)}
   * method with your desired outputs and constraints applied.
   *
   * @see {@linkcode VideoDynamicRangeConstraint.videoDynamicRange}
   * @see {@linkcode CameraVideoOutput}
   */
  readonly supportedVideoDynamicRanges: DynamicRange[]

  /**
   * Gets all available Frame Rate Ranges this
   * {@linkcode CameraDevice} supports individually.
   *
   * Frame Rates are expressed in FPS (Frames per Second),
   * for example `60` refers to 60 FPS (= 16.666ms per Frame).
   *
   * @discussion
   * Use {@linkcode supportsFPS | supportsFPS(...)} as a convenience
   * method to find out if a given fixed frame rate is supported
   * individually.
   *
   * @discussion
   * While a device may support a given FPS {@linkcode Range}
   * individually, it is not guaranteed to be supported with all
   * possible feature and output combinations.
   *
   * The {@linkcode Constraint} API (specifically {@linkcode FPSConstraint})
   * internally negotiates the target {@linkcode FPSConstraint.fps | fps}
   * with other enabled features (such as {@linkcode VideoStabilizationModeConstraint})
   * and all connected {@linkcode CameraOutput}s to find a best-matching
   * supported combination on this device.
   *
   * Alternatively, to find out if a specific combination is supported upfront,
   * use the {@linkcode isSessionConfigSupported | isSessionConfigSupported(...)}
   * method with your desired outputs and constraints applied.
   */
  readonly supportedFPSRanges: Range[]
  /**
   * Gets whether the given {@linkcode fps} is individually supported
   * by any of the {@linkcode supportedFPSRanges} on this {@linkcode CameraDevice}.
   *
   * @discussion
   * While a device may support a given FPS {@linkcode Range}
   * individually, it is not guaranteed to be supported with all
   * possible feature and output combinations.
   *
   * The {@linkcode Constraint} API (specifically {@linkcode FPSConstraint})
   * internally negotiates the target {@linkcode FPSConstraint.fps | fps}
   * with other enabled features (such as {@linkcode VideoStabilizationModeConstraint})
   * and all connected {@linkcode CameraOutput}s to find a best-matching
   * supported combination on this device.
   *
   * Alternatively, to find out if a specific combination is supported upfront,
   * use the {@linkcode isSessionConfigSupported | isSessionConfigSupported(...)}
   * method with your desired outputs and constraints applied.
   *
   * @see {@linkcode supportedFPSRanges}
   */
  supportsFPS(fps: number): boolean

  /**
   * Returns whether this {@linkcode CameraDevice} supports
   * the given {@linkcode StabilizationMode} for video streams
   * (e.g. {@linkcode CameraVideoOutput}).
   *
   * @discussion
   * While a device may support a given {@linkcode StabilizationMode}
   * individually, it is not guaranteed to be supported with all
   * possible feature and output combinations.
   *
   * The {@linkcode Constraint} API (specifically
   * {@linkcode VideoStabilizationModeConstraint}) internally
   * negotiates the target {@linkcode VideoStabilizationModeConstraint.videoStabilizationMode | videoStabilizationMode}
   * with other enabled features (such as {@linkcode FPSConstraint}) and
   * all connected {@linkcode CameraOutput}s to find a best-matching
   * supported combination on this device.
   *
   * Alternatively, to find out if a specific combination is supported upfront,
   * use the {@linkcode isSessionConfigSupported | isSessionConfigSupported(...)}
   * method with your desired outputs and constraints applied.
   */
  supportsVideoStabilizationMode(
    videoStabilizationMode: TargetStabilizationMode,
  ): boolean
  /**
   * Returns whether this {@linkcode CameraDevice} supports
   * the given {@linkcode StabilizationMode} for preview streams
   * (e.g. {@linkcode CameraPreviewOutput}).
   *
   * @discussion
   * While a device may support a given {@linkcode StabilizationMode}
   * individually, it is not guaranteed to be supported with all
   * possible feature and output combinations.
   *
   * The {@linkcode Constraint} API (specifically
   * {@linkcode PreviewStabilizationModeConstraint}) internally
   * negotiates the target {@linkcode PreviewStabilizationModeConstraint.previewStabilizationMode | previewStabilizationMode}
   * with other enabled features (such as {@linkcode FPSConstraint}) and
   * all connected {@linkcode CameraOutput}s to find a best-matching
   * supported combination on this device.
   *
   * Alternatively, to find out if a specific combination is supported upfront,
   * use the {@linkcode isSessionConfigSupported | isSessionConfigSupported(...)}
   * method with your desired outputs and constraints applied.
   */
  supportsPreviewStabilizationMode(
    previewStabilizationMode: TargetStabilizationMode,
  ): boolean
  /**
   * Returns `true` if this {@linkcode CameraDevice} supports
   * delivering preview {@linkcode Image} instances before
   * the actual {@linkcode Photo} is available.
   *
   * On iOS, this is always `true`.
   *
   * @see {@linkcode PhotoOutputOptions.previewImageTargetSize}
   * @see {@linkcode CapturePhotoCallbacks.onPreviewImageAvailable}
   */
  readonly supportsPreviewImage: boolean

  /**
   * Returns `true` if this {@linkcode CameraDevice} supports
   * capturing photos with the {@linkcode QualityPrioritization | 'speed'}
   * {@linkcode QualityPrioritization}.
   *
   * @see {@linkcode PhotoOutputOptions.qualityPrioritization}
   */
  readonly supportsSpeedQualityPrioritization: boolean

  // pragma MARK: Focal Length
  /**
   * Returns the Camera Device's nominal focal length in 35mm film format.
   */
  readonly focalLength?: number
  /**
   * The size (ƒ number) of the lens diaphragm.
   */
  readonly lensAperture: number

  // pragma MARK: Continuity
  /**
   * Returns `true` if this camera is a Continuity Camera.
   * On non iOS platforms this is always `false`.
   *
   * @platform iOS
   */
  readonly isContinuityCamera: boolean
  /**
   * The matching Desk View camera for this Continuity Camera, if available.
   *
   * @platform iOS
   */
  readonly companionDeskViewCamera?: CameraDevice

  // pragma MARK: Methods
  /**
   * Represents all {@linkcode MediaType}s this
   * {@linkcode CameraDevice} can capture.
   *
   * Most Cameras return {@linkcode MediaType | ['video']}.
   * Virtual Cameras that also support Depth Capture return {@linkcode MediaType | ['video', 'depth']}.
   */
  readonly mediaTypes: MediaType[]

  // pragma MARK: Focus
  /**
   * Gets whether this {@linkcode CameraDevice}
   * supports metering auto-focus ({@linkcode MeteringMode | 'AF'})
   * via {@linkcode CameraController.focusTo | focusTo(...)}.
   */
  readonly supportsFocusMetering: boolean
  /**
   * Gets whether this {@linkcode CameraDevice}
   * supports manual focus via
   * {@linkcode CameraController.setFocusLocked | setFocusLocked(...)}.
   */
  readonly supportsFocusLocking: boolean
  /**
   * Gets whether this {@linkcode CameraDevice}
   * supports smoothly adjusting focus via
   * {@linkcode CameraControllerConfiguration.enableSmoothAutoFocus}.
   *
   * @example
   * ```ts
   * await controller.configure({
   *   enableSmoothAutoFocus: device.supportsSmoothAutoFocus
   * })
   * ```
   */
  readonly supportsSmoothAutoFocus: boolean

  // pragma MARK: Exposure
  /**
   * Gets whether this {@linkcode CameraDevice}
   * supports metering auto-exposure ({@linkcode MeteringMode | 'AE'})
   * via {@linkcode CameraController.focusTo | focusTo(...)}.
   */
  readonly supportsExposureMetering: boolean
  /**
   * Gets whether this {@linkcode CameraDevice}
   * supports manual exposure via
   * {@linkcode CameraController.setExposureLocked | setExposureLocked(...)}.
   */
  readonly supportsExposureLocking: boolean
  /**
   * Gets whether this {@linkcode CameraDevice}
   * supports biasing auto-exposure via
   * {@linkcode CameraController.setExposureBias | setExposureBias(...)}.
   */
  readonly supportsExposureBias: boolean
  /**
   * Gets the minimum supported value for
   * the exposure bias (in EV units), or `0`
   * if {@linkcode supportsExposureBias} is false.
   */
  readonly minExposureBias: number
  /**
   * Gets the maximum supported value for
   * the exposure bias (in EV units), or `0`
   * if {@linkcode supportsExposureBias} is false.
   */
  readonly maxExposureBias: number

  // pragma MARK: White Balance
  /**
   * Gets whether this {@linkcode CameraDevice}
   * supports metering auto-white-balance ({@linkcode MeteringMode | 'AWB'})
   * via {@linkcode CameraController.focusTo | focusTo(...)}.
   */
  readonly supportsWhiteBalanceMetering: boolean
  /**
   * The maximum value a single color-channel can be
   * set to in {@linkcode WhiteBalanceGains}, or `0`
   * if {@linkcode supportsWhiteBalanceLocking} is `false`.
   */
  readonly maxWhiteBalanceGain: number
  /**
   * Gets whether this {@linkcode CameraDevice}
   * supports manual white-balance via
   * {@linkcode CameraController.setWhiteBalanceLocked | setWhiteBalanceLocked(...)}.
   *
   * @see {@linkcode maxWhiteBalanceGain}
   */
  readonly supportsWhiteBalanceLocking: boolean

  // pragma MARK: Flash
  /**
   * Whether this {@linkcode CameraDevice} has a
   * physical flash unit, or not.
   *
   * For {@linkcode CameraPosition | front}-facing
   * devices, {@linkcode hasFlash} may be `false`,
   * but you might still be able to use a screen-
   * flash for photo capture.
   *
   * @see {@linkcode CapturePhotoSettings.flashMode}
   */
  readonly hasFlash: boolean
  /**
   * Whether this {@linkcode CameraDevice} supports
   * using its flash ({@linkcode hasFlash}) as a
   * continuous light (_"torch"_) while the session is running.
   *
   * In almost all cases, {@linkcode hasTorch} is the
   * same as {@linkcode hasFlash}.
   *
   * Use {@linkcode supportsTorchStrength} to find out whether
   * the torch additionally accepts a custom brightness level
   * via {@linkcode CameraController.enableTorchWithStrength | enableTorchWithStrength(...)}.
   *
   * @see {@linkcode CameraController.setTorchMode | setTorchMode(...)}
   * @see {@linkcode supportsTorchStrength}
   */
  readonly hasTorch: boolean
  /**
   * Whether this {@linkcode CameraDevice} supports configuring
   * a custom torch brightness level via
   * {@linkcode CameraController.enableTorchWithStrength | enableTorchWithStrength(...)}.
   *
   * @discussion
   * Many devices with a {@linkcode hasTorch | torch} can only
   * toggle the torch on or off and do not expose a brightness
   * level - calling
   * {@linkcode CameraController.enableTorchWithStrength | enableTorchWithStrength(...)}
   * on such a device will fail. Use
   * {@linkcode CameraController.setTorchMode | setTorchMode('on')}
   * instead to turn the torch on at the system default level.
   *
   * @see {@linkcode hasTorch}
   * @see {@linkcode CameraController.enableTorchWithStrength | enableTorchWithStrength(...)}
   */
  readonly supportsTorchStrength: boolean
  /**
   * Gets the minimum supported torch strength for this device,
   * or `0` if {@linkcode supportsTorchStrength} is false.
   *
   * Use {@linkcode CameraController.enableTorchWithStrength | enableTorchWithStrength(...)}
   * to set the torch strength.
   *
   * @see {@linkcode supportsTorchStrength}
   * @see {@linkcode maxTorchStrength}
   */
  readonly minTorchStrength: number
  /**
   * Gets the maximum supported torch strength for this device,
   * or `0` if {@linkcode supportsTorchStrength} is false.
   *
   * Use {@linkcode CameraController.enableTorchWithStrength | enableTorchWithStrength(...)}
   * to set the torch strength.
   *
   * @see {@linkcode supportsTorchStrength}
   * @see {@linkcode minTorchStrength}
   */
  readonly maxTorchStrength: number

  // pragma MARK: Low Light Boost
  /**
   * Whether this {@linkcode CameraDevice} supports
   * enabling low-light boost to improve exposure in
   * dark scenes via {@linkcode CameraControllerConfiguration.enableLowLightBoost}.
   *
   * @example
   * ```ts
   * await controller.configure({
   *   enableLowLightBoost: device.supportsLowLightBoost
   * })
   * ```
   */
  readonly supportsLowLightBoost: boolean

  // pragma MARK: Zoom
  /**
   * The minimum individually supported zoom value of this device.
   *
   * @note Depending on the {@linkcode Constraint}s and
   * {@linkcode CameraOutput}s configured on the
   * {@linkcode CameraSession}, the actual minimum zoom
   * value may change.
   * Inspect the returned {@linkcode CameraController}'s
   * {@linkcode CameraController.minZoom | minZoom} property
   * for a true current minimum.
   */
  readonly minZoom: number
  /**
   * The maximum individually supported zoom value of this device.
   *
   * @note Depending on the {@linkcode Constraint}s and
   * {@linkcode CameraOutput}s configured on the
   * {@linkcode CameraSession}, the actual maximum zoom
   * value may change.
   * Inspect the returned {@linkcode CameraController}'s
   * {@linkcode CameraController.maxZoom | maxZoom} property
   * for a true current maximum.
   */
  readonly maxZoom: number
  /**
   * The zoom factor at which this Camera appears naturally zoomed (`1x`)
   * to the user.
   *
   * For physical Cameras and Android devices this is typically `1.0`.
   * On iOS virtual Cameras that include an ultra-wide-angle lens, this can
   * be greater than `1.0` because AVFoundation's internal zoom scale starts
   * at the widest constituent lens.
   *
   * Use this value as the initial zoom if the Camera should start on its
   * standard wide-angle lens while still allowing the user to zoom out.
   */
  readonly neutralZoom: number
  /**
   * If this {@linkcode CameraDevice} is a virtual device,
   * this returns a list of zoom factors at which the virtual
   * device may switch to another physical camera.
   *
   * For physical devices, this returns an empty array.
   *
   * @example
   * ```ts
   * const camera = ...           // Triple-Camera (0.5x, 1x, 3x)
   * camera.zoomLensSwitchFactors // [1, 3]
   * ```
   */
  readonly zoomLensSwitchFactors: number[]
  /**
   * Whether the {@linkcode CameraDevice} supports
   * distortion correction to correct stretched edges
   * in wide-angle Cameras during Photo capture.
   * @see {@linkcode CapturePhotoSettings.enableDistortionCorrection}
   */
  readonly supportsDistortionCorrection: boolean

  /**
   * Returns whether the given {@linkcode CameraSessionConfig}
   * is supported by this {@linkcode CameraDevice}, or not.
   *
   * If this method returns `false`, configuring a
   * {@linkcode CameraSession} with this {@linkcode CameraSessionConfig}
   * will fail.
   */
  isSessionConfigSupported(config: CameraSessionConfig): boolean
}
