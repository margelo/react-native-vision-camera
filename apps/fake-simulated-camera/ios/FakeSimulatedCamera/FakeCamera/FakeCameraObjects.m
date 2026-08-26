#import "FakeCameraObjects.h"

#import <objc/runtime.h>

#import "FakeCameraLog.h"

static id createInstance(Class cls) {
  id object = class_createInstance(cls, 0);
  [FakeCameraRegistry.shared retainForever:object];
  return object;
}

static CMVideoDimensions dimensionsFromValue(NSValue *value) {
  CMVideoDimensions dims;
  [value getValue:&dims];
  return dims;
}

// MARK: - AVFrameRateRange

@implementation FakeCameraFrameRateRange {
  Float64 _minFrameRate;
  Float64 _maxFrameRate;
}

+ (instancetype)rangeWithMinFrameRate:(Float64)minFrameRate maxFrameRate:(Float64)maxFrameRate {
  FakeCameraFrameRateRange *range = createInstance(self);
  range->_minFrameRate = minFrameRate;
  range->_maxFrameRate = maxFrameRate;
  return range;
}

- (Float64)minFrameRate {
  return _minFrameRate;
}

- (Float64)maxFrameRate {
  return _maxFrameRate;
}

- (CMTime)maxFrameDuration {
  return CMTimeMake(1000, (int32_t)(_minFrameRate * 1000));
}

- (CMTime)minFrameDuration {
  return CMTimeMake(1000, (int32_t)(_maxFrameRate * 1000));
}

// VisionCamera dedups ranges by equality (`withoutDuplicates()`), so equal min/max means equal range.
- (BOOL)isEqual:(id)object {
  if (![object isKindOfClass:[FakeCameraFrameRateRange class]]) {
    return NO;
  }
  FakeCameraFrameRateRange *other = object;
  return other->_minFrameRate == _minFrameRate && other->_maxFrameRate == _maxFrameRate;
}

- (NSUInteger)hash {
  return (NSUInteger)(_minFrameRate * 1000) ^ ((NSUInteger)(_maxFrameRate * 1000) << 16);
}

- (NSString *)description {
  return [NSString stringWithFormat:@"<FakeCameraFrameRateRange %g-%g fps>", _minFrameRate, _maxFrameRate];
}

- (NSString *)debugDescription {
  return self.description;
}

FAKECAM_FORWARDING_NET

@end

// MARK: - AVCaptureDeviceFormat

@implementation FakeCameraFormat {
  FakeCameraFormatSpec *_spec;
  CMVideoFormatDescriptionRef _formatDescription;
  NSArray<AVFrameRateRange *> *_frameRateRanges;
}

+ (instancetype)formatWithSpec:(FakeCameraFormatSpec *)spec {
  FakeCameraFormat *format = createInstance(self);
  format->_spec = spec;
  OSStatus status = CMVideoFormatDescriptionCreate(kCFAllocatorDefault, spec.pixelFormatType, spec.width, spec.height, NULL,
                                                   &format->_formatDescription);
  NSCAssert(status == noErr, @"CMVideoFormatDescriptionCreate failed for %@: %d", spec.name, (int)status);
  NSMutableArray *ranges = [NSMutableArray array];
  for (NSArray<NSNumber *> *range in spec.fpsRanges) {
    [ranges addObject:[FakeCameraFrameRateRange rangeWithMinFrameRate:range[0].doubleValue maxFrameRate:range[1].doubleValue]];
  }
  format->_frameRateRanges = ranges;
  return format;
}

- (FakeCameraFormatSpec *)spec {
  return _spec;
}

- (CMFormatDescriptionRef)formatDescription {
  return _formatDescription;
}

- (AVMediaType)mediaType {
  return AVMediaTypeVideo;
}

- (NSArray<AVFrameRateRange *> *)videoSupportedFrameRateRanges {
  return _frameRateRanges;
}

- (NSArray<NSValue *> *)supportedMaxPhotoDimensions {
  return _spec.photoDimensions;
}

- (CMVideoDimensions)highResolutionStillImageDimensions {
  CMVideoDimensions largest = {0, 0};
  for (NSValue *value in _spec.photoDimensions) {
    CMVideoDimensions dims = dimensionsFromValue(value);
    if ((int64_t)dims.width * dims.height > (int64_t)largest.width * largest.height) {
      largest = dims;
    }
  }
  return largest;
}

- (BOOL)isVideoBinned {
  return _spec.binned;
}

- (BOOL)isVideoHDRSupported {
  return _spec.videoHDR;
}

- (BOOL)isHighestPhotoQualitySupported {
  return _spec.highestPhotoQuality;
}

- (BOOL)isHighPhotoQualitySupported {
  return _spec.highPhotoQuality;
}

- (AVCaptureAutoFocusSystem)autoFocusSystem {
  return _spec.autoFocusSystem;
}

// `.off` and `.auto` are reported as supported like AVFoundation does; VisionCamera's downgrade loop relies on it.
- (BOOL)isVideoStabilizationModeSupported:(AVCaptureVideoStabilizationMode)mode {
  if (mode == AVCaptureVideoStabilizationModeOff || mode == AVCaptureVideoStabilizationModeAuto) {
    return YES;
  }
  return [_spec.videoStabilizationModes containsObject:@(mode)];
}

- (NSArray<NSNumber *> *)supportedColorSpaces {
  return _spec.colorSpaces;
}

- (BOOL)isMultiCamSupported {
  return _spec.multiCam;
}

- (NSArray<Class> *)unsupportedCaptureOutputClasses {
  return @[];
}

- (NSArray<AVCaptureDeviceFormat *> *)supportedDepthDataFormats {
  return @[];
}

- (CGFloat)videoMaxZoomFactor {
  return 16.0;
}

- (CGFloat)videoZoomFactorUpscaleThreshold {
  return 2.0;
}

- (float)minISO {
  return 25.0f;
}

- (float)maxISO {
  return 6400.0f;
}

- (CMTime)minExposureDuration {
  return CMTimeMake(1, 8000);
}

- (CMTime)maxExposureDuration {
  return CMTimeMake(1, 3);
}

- (float)videoFieldOfView {
  return 70.0f;
}

- (BOOL)isPortraitEffectSupported {
  return NO;
}

- (BOOL)isCenterStageSupported {
  return NO;
}

- (BOOL)isStudioLightSupported {
  return NO;
}

- (BOOL)reactionEffectsSupported {
  return NO;
}

- (BOOL)isBackgroundReplacementSupported {
  return NO;
}

- (BOOL)isGlobalToneMappingSupported {
  return NO;
}

- (BOOL)isSpatialVideoCaptureSupported {
  return NO;
}

- (BOOL)isVideoFrameRateRangeForDepthDataDeliverySupported {
  return NO;
}

- (NSArray *)supportedVideoZoomRangesForDepthDataDelivery {
  return @[];
}

- (NSArray<NSNumber *> *)secondaryNativeResolutionZoomFactors {
  return @[];
}

- (id)systemRecommendedVideoZoomRange {
  return nil;
}

- (id)systemRecommendedExposureBiasRange {
  return nil;
}

// Private accessor AVFoundation reaches for while describing/comparing formats.
- (id)figCaptureSourceVideoFormat {
  return nil;
}

- (BOOL)isEqual:(id)object {
  return self == object;
}

- (NSUInteger)hash {
  return (NSUInteger)(__bridge void *)self;
}

- (NSString *)description {
  char fourCC[5] = {(char)(_spec.pixelFormatType >> 24), (char)(_spec.pixelFormatType >> 16), (char)(_spec.pixelFormatType >> 8), (char)_spec.pixelFormatType, 0};
  return [NSString stringWithFormat:@"<FakeCameraFormat %@ %dx%d '%s' %@>", _spec.name, _spec.width, _spec.height, fourCC, _frameRateRanges];
}

- (NSString *)debugDescription {
  return self.description;
}

FAKECAM_FORWARDING_NET

@end

// MARK: - AVCaptureDevice

@implementation FakeCameraDevice {
  FakeCameraDeviceSpec *_spec;
  NSArray<FakeCameraFormat *> *_fakeFormats;
  FakeCameraFormat *_activeFormat;
  CMTime _activeVideoMinFrameDuration;
  CMTime _activeVideoMaxFrameDuration;
  CGFloat _videoZoomFactor;
  AVCaptureFocusMode _focusMode;
  AVCaptureExposureMode _exposureMode;
  AVCaptureWhiteBalanceMode _whiteBalanceMode;
  CGPoint _focusPointOfInterest;
  CGPoint _exposurePointOfInterest;
  AVCaptureColorSpace _activeColorSpace;
  BOOL _videoHDREnabled;
  BOOL _automaticallyAdjustsVideoHDREnabled;
  float _exposureTargetBias;
  float _lensPosition;
  AVCaptureTorchMode _torchMode;
  float _torchLevel;
  BOOL _subjectAreaChangeMonitoringEnabled;
  BOOL _smoothAutoFocusEnabled;
  BOOL _geometricDistortionCorrectionEnabled;
  BOOL _automaticallyEnablesLowLightBoostWhenAvailable;
  AVCaptureAutoFocusRangeRestriction _autoFocusRangeRestriction;
  CMTime _activeMaxExposureDuration;
  CMTime _exposureDuration;
  float _ISO;
  AVCaptureWhiteBalanceGains _whiteBalanceGains;
}

+ (instancetype)deviceWithSpec:(FakeCameraDeviceSpec *)spec {
  FakeCameraDevice *device = createInstance(self);
  device->_spec = spec;
  NSMutableArray *formats = [NSMutableArray array];
  for (FakeCameraFormatSpec *formatSpec in spec.formats) {
    [formats addObject:[FakeCameraFormat formatWithSpec:formatSpec]];
  }
  device->_fakeFormats = formats;
  device->_activeFormat = formats.firstObject;
  device->_activeVideoMinFrameDuration = CMTimeMake(1, 30);
  device->_activeVideoMaxFrameDuration = CMTimeMake(1, 30);
  device->_videoZoomFactor = 1.0;
  device->_focusMode = spec.supportsFocus ? AVCaptureFocusModeContinuousAutoFocus : AVCaptureFocusModeLocked;
  device->_exposureMode = spec.supportsExposure ? AVCaptureExposureModeContinuousAutoExposure : AVCaptureExposureModeLocked;
  device->_whiteBalanceMode = spec.supportsWhiteBalance ? AVCaptureWhiteBalanceModeContinuousAutoWhiteBalance : AVCaptureWhiteBalanceModeLocked;
  device->_focusPointOfInterest = CGPointMake(0.5, 0.5);
  device->_exposurePointOfInterest = CGPointMake(0.5, 0.5);
  device->_activeColorSpace = AVCaptureColorSpace_sRGB;
  device->_automaticallyAdjustsVideoHDREnabled = YES;
  device->_torchMode = AVCaptureTorchModeOff;
  device->_activeMaxExposureDuration = CMTimeMake(1, 30);
  device->_exposureDuration = CMTimeMake(1, 60);
  device->_ISO = 100.0f;
  device->_whiteBalanceGains = (AVCaptureWhiteBalanceGains){1.5f, 1.0f, 1.8f};
  return device;
}

- (FakeCameraDeviceSpec *)spec {
  return _spec;
}

- (NSArray<FakeCameraFormat *> *)fakeFormats {
  return _fakeFormats;
}

// MARK: Identity

- (NSString *)uniqueID {
  return _spec.uniqueID;
}

- (NSString *)modelID {
  return _spec.modelID;
}

- (NSString *)localizedName {
  return _spec.name;
}

- (NSString *)manufacturer {
  return @"FakeSimulatedCamera";
}

- (AVCaptureDeviceType)deviceType {
  return _spec.deviceType;
}

- (AVCaptureDevicePosition)position {
  return _spec.position;
}

- (BOOL)hasMediaType:(AVMediaType)mediaType {
  return [mediaType isEqualToString:AVMediaTypeVideo];
}

- (BOOL)isConnected {
  return YES;
}

- (BOOL)isSuspended {
  return NO;
}

- (BOOL)supportsAVCaptureSessionPreset:(AVCaptureSessionPreset)preset {
  return YES;
}

- (NSArray<AVCaptureDeviceFormat *> *)formats {
  return _fakeFormats;
}

- (AVCaptureDeviceFormat *)activeFormat {
  return _activeFormat;
}

- (void)setActiveFormat:(AVCaptureDeviceFormat *)activeFormat {
  FakeCameraFileLog([NSString stringWithFormat:@"device %@: setActiveFormat begin", _spec.uniqueID]);
  FakeCameraFormat *format = (FakeCameraFormat *)activeFormat;
  NSAssert([_fakeFormats containsObject:format], @"activeFormat %@ is not a format of %@", activeFormat, self);
  _activeFormat = format;
  FakeCameraFileLog([NSString stringWithFormat:@"device %@: setActiveFormat end", _spec.uniqueID]);
}

- (AVCaptureDeviceFormat *)activeDepthDataFormat {
  return nil;
}

- (void)setActiveDepthDataFormat:(AVCaptureDeviceFormat *)activeDepthDataFormat {
  NSAssert(activeDepthDataFormat == nil, @"depth formats are not supported by FakeCamera");
}

- (CMTime)activeDepthDataMinFrameDuration {
  return kCMTimeInvalid;
}

- (CMTime)activeVideoMinFrameDuration {
  return _activeVideoMinFrameDuration;
}

- (void)setActiveVideoMinFrameDuration:(CMTime)duration {
  _activeVideoMinFrameDuration = duration;
}

- (CMTime)activeVideoMaxFrameDuration {
  return _activeVideoMaxFrameDuration;
}

- (void)setActiveVideoMaxFrameDuration:(CMTime)duration {
  _activeVideoMaxFrameDuration = duration;
}

- (BOOL)lockForConfiguration:(NSError **)error {
  FakeCameraFileLog([NSString stringWithFormat:@"device %@: lockForConfiguration", _spec.uniqueID]);
  return YES;
}

- (void)unlockForConfiguration {
  FakeCameraFileLog([NSString stringWithFormat:@"device %@: unlockForConfiguration", _spec.uniqueID]);
}

// MARK: Device topology

- (NSArray<AVCaptureDevice *> *)constituentDevices {
  return @[];
}

- (BOOL)isVirtualDevice {
  return NO;
}

- (NSArray<NSNumber *> *)virtualDeviceSwitchOverVideoZoomFactors {
  return @[];
}

- (AVCaptureDevice *)primaryConstituentDevice {
  return nil;
}

- (BOOL)isContinuityCamera {
  return NO;
}

- (AVCaptureDevice *)companionDeskViewCamera {
  return nil;
}

- (float)lensAperture {
  return _spec.lensAperture;
}

- (float)nominalFocalLengthIn35mmFilm {
  return (float)_spec.focalLength;
}

// MARK: Zoom

- (CGFloat)videoZoomFactor {
  return _videoZoomFactor;
}

- (void)setVideoZoomFactor:(CGFloat)videoZoomFactor {
  _videoZoomFactor = videoZoomFactor;
}

- (CGFloat)minAvailableVideoZoomFactor {
  return _spec.minZoom;
}

- (CGFloat)maxAvailableVideoZoomFactor {
  return _spec.maxZoom;
}

- (void)rampToVideoZoomFactor:(CGFloat)factor withRate:(float)rate {
  _videoZoomFactor = factor;
}

- (void)cancelVideoZoomRamp {
}

- (BOOL)isRampingVideoZoom {
  return NO;
}

- (CGFloat)displayVideoZoomFactorMultiplier {
  return 1.0;
}

- (CGFloat)dualCameraSwitchOverVideoZoomFactor {
  return 2.0;
}

// MARK: Flash & torch

- (BOOL)hasFlash {
  return _spec.hasFlash;
}

- (BOOL)isFlashAvailable {
  return _spec.hasFlash;
}

- (BOOL)isFlashActive {
  return NO;
}

- (BOOL)hasTorch {
  return _spec.hasTorch;
}

- (BOOL)isTorchAvailable {
  return _spec.hasTorch;
}

- (BOOL)isTorchActive {
  return _torchMode == AVCaptureTorchModeOn;
}

- (float)torchLevel {
  return _torchLevel;
}

- (AVCaptureTorchMode)torchMode {
  return _torchMode;
}

- (void)setTorchMode:(AVCaptureTorchMode)torchMode {
  _torchMode = torchMode;
  _torchLevel = torchMode == AVCaptureTorchModeOn ? 1.0f : 0.0f;
}

- (BOOL)isTorchModeSupported:(AVCaptureTorchMode)torchMode {
  return torchMode == AVCaptureTorchModeOff || _spec.hasTorch;
}

- (BOOL)setTorchModeOnWithLevel:(float)torchLevel error:(NSError **)error {
  _torchMode = AVCaptureTorchModeOn;
  _torchLevel = torchLevel;
  return YES;
}

// MARK: Focus

- (AVCaptureFocusMode)focusMode {
  return _focusMode;
}

- (void)setFocusMode:(AVCaptureFocusMode)focusMode {
  _focusMode = focusMode;
}

- (BOOL)isFocusModeSupported:(AVCaptureFocusMode)focusMode {
  return focusMode == AVCaptureFocusModeLocked || _spec.supportsFocus;
}

- (BOOL)isLockingFocusWithCustomLensPositionSupported {
  return _spec.supportsFocus;
}

- (float)lensPosition {
  return _lensPosition;
}

- (void)setFocusModeLockedWithLensPosition:(float)lensPosition completionHandler:(void (^)(CMTime))handler {
  _focusMode = AVCaptureFocusModeLocked;
  _lensPosition = lensPosition;
  if (handler) {
    handler(CMClockGetTime(CMClockGetHostTimeClock()));
  }
}

- (CGPoint)focusPointOfInterest {
  return _focusPointOfInterest;
}

- (void)setFocusPointOfInterest:(CGPoint)point {
  _focusPointOfInterest = point;
}

- (BOOL)isFocusPointOfInterestSupported {
  return _spec.supportsFocus;
}

- (BOOL)isAdjustingFocus {
  return NO;
}

- (BOOL)isSmoothAutoFocusSupported {
  return _spec.supportsFocus;
}

- (BOOL)isSmoothAutoFocusEnabled {
  return _smoothAutoFocusEnabled;
}

- (void)setSmoothAutoFocusEnabled:(BOOL)enabled {
  _smoothAutoFocusEnabled = enabled;
}

- (AVCaptureAutoFocusRangeRestriction)autoFocusRangeRestriction {
  return _autoFocusRangeRestriction;
}

- (void)setAutoFocusRangeRestriction:(AVCaptureAutoFocusRangeRestriction)restriction {
  _autoFocusRangeRestriction = restriction;
}

- (BOOL)isAutoFocusRangeRestrictionSupported {
  return _spec.supportsFocus;
}

- (NSInteger)minimumFocusDistance {
  return 100;
}

- (BOOL)isFaceDrivenAutoFocusEnabled {
  return NO;
}

- (BOOL)automaticallyAdjustsFaceDrivenAutoFocusEnabled {
  return NO;
}

// MARK: Exposure

- (AVCaptureExposureMode)exposureMode {
  return _exposureMode;
}

- (void)setExposureMode:(AVCaptureExposureMode)exposureMode {
  _exposureMode = exposureMode;
}

- (BOOL)isExposureModeSupported:(AVCaptureExposureMode)exposureMode {
  return exposureMode == AVCaptureExposureModeLocked || _spec.supportsExposure;
}

- (CGPoint)exposurePointOfInterest {
  return _exposurePointOfInterest;
}

- (void)setExposurePointOfInterest:(CGPoint)point {
  _exposurePointOfInterest = point;
}

- (BOOL)isExposurePointOfInterestSupported {
  return _spec.supportsExposure;
}

- (BOOL)isAdjustingExposure {
  return NO;
}

- (CMTime)exposureDuration {
  return _exposureDuration;
}

- (float)ISO {
  return _ISO;
}

- (CMTime)activeMaxExposureDuration {
  return _activeMaxExposureDuration;
}

- (void)setActiveMaxExposureDuration:(CMTime)duration {
  _activeMaxExposureDuration = duration;
}

- (void)setExposureModeCustomWithDuration:(CMTime)duration ISO:(float)ISO completionHandler:(void (^)(CMTime))handler {
  _exposureMode = AVCaptureExposureModeCustom;
  if (CMTIME_IS_VALID(duration) && CMTimeCompare(duration, AVCaptureExposureDurationCurrent) != 0) {
    _exposureDuration = duration;
  }
  if (ISO != AVCaptureISOCurrent) {
    _ISO = ISO;
  }
  if (handler) {
    handler(CMClockGetTime(CMClockGetHostTimeClock()));
  }
}

- (float)exposureTargetBias {
  return _exposureTargetBias;
}

- (float)exposureTargetOffset {
  return 0.0f;
}

- (float)minExposureTargetBias {
  return _spec.minExposureBias;
}

- (float)maxExposureTargetBias {
  return _spec.maxExposureBias;
}

- (void)setExposureTargetBias:(float)bias completionHandler:(void (^)(CMTime))handler {
  _exposureTargetBias = bias;
  if (handler) {
    handler(CMClockGetTime(CMClockGetHostTimeClock()));
  }
}

- (BOOL)isFaceDrivenAutoExposureEnabled {
  return NO;
}

- (BOOL)automaticallyAdjustsFaceDrivenAutoExposureEnabled {
  return NO;
}

// MARK: White balance

- (AVCaptureWhiteBalanceMode)whiteBalanceMode {
  return _whiteBalanceMode;
}

- (void)setWhiteBalanceMode:(AVCaptureWhiteBalanceMode)whiteBalanceMode {
  _whiteBalanceMode = whiteBalanceMode;
}

- (BOOL)isWhiteBalanceModeSupported:(AVCaptureWhiteBalanceMode)whiteBalanceMode {
  return whiteBalanceMode == AVCaptureWhiteBalanceModeLocked || _spec.supportsWhiteBalance;
}

- (BOOL)isAdjustingWhiteBalance {
  return NO;
}

- (BOOL)isLockingWhiteBalanceWithCustomDeviceGainsSupported {
  return _spec.supportsWhiteBalance;
}

- (AVCaptureWhiteBalanceGains)deviceWhiteBalanceGains {
  return _whiteBalanceGains;
}

- (AVCaptureWhiteBalanceGains)grayWorldDeviceWhiteBalanceGains {
  return _whiteBalanceGains;
}

- (float)maxWhiteBalanceGain {
  return 4.0f;
}

- (void)setWhiteBalanceModeLockedWithDeviceWhiteBalanceGains:(AVCaptureWhiteBalanceGains)gains completionHandler:(void (^)(CMTime))handler {
  _whiteBalanceMode = AVCaptureWhiteBalanceModeLocked;
  if (gains.redGain != AVCaptureWhiteBalanceGainsCurrent.redGain) {
    _whiteBalanceGains = gains;
  }
  if (handler) {
    handler(CMClockGetTime(CMClockGetHostTimeClock()));
  }
}

- (AVCaptureWhiteBalanceTemperatureAndTintValues)temperatureAndTintValuesForDeviceWhiteBalanceGains:(AVCaptureWhiteBalanceGains)gains {
  // ponytail: linear stand-in for Apple's calibration curve; tests only check round-trips.
  return (AVCaptureWhiteBalanceTemperatureAndTintValues){.temperature = 6500.0f / MAX(gains.redGain, 0.01f) * gains.blueGain, .tint = (gains.greenGain - 1.0f) * 100.0f};
}

- (AVCaptureWhiteBalanceGains)deviceWhiteBalanceGainsForTemperatureAndTintValues:(AVCaptureWhiteBalanceTemperatureAndTintValues)values {
  return (AVCaptureWhiteBalanceGains){.redGain = MAX(1.0f, 6500.0f / MAX(values.temperature, 1.0f)), .greenGain = 1.0f + values.tint / 100.0f, .blueGain = 1.0f};
}

- (AVCaptureWhiteBalanceChromaticityValues)chromaticityValuesForDeviceWhiteBalanceGains:(AVCaptureWhiteBalanceGains)gains {
  return (AVCaptureWhiteBalanceChromaticityValues){.x = 0.3127f, .y = 0.329f};
}

- (AVCaptureWhiteBalanceGains)deviceWhiteBalanceGainsForChromaticityValues:(AVCaptureWhiteBalanceChromaticityValues)values {
  return _whiteBalanceGains;
}

// MARK: Misc capabilities

- (BOOL)isSubjectAreaChangeMonitoringEnabled {
  return _subjectAreaChangeMonitoringEnabled;
}

- (void)setSubjectAreaChangeMonitoringEnabled:(BOOL)enabled {
  _subjectAreaChangeMonitoringEnabled = enabled;
}

- (BOOL)isLowLightBoostSupported {
  return _spec.supportsLowLightBoost;
}

- (BOOL)isLowLightBoostEnabled {
  return NO;
}

- (BOOL)automaticallyEnablesLowLightBoostWhenAvailable {
  return _automaticallyEnablesLowLightBoostWhenAvailable;
}

- (void)setAutomaticallyEnablesLowLightBoostWhenAvailable:(BOOL)enabled {
  _automaticallyEnablesLowLightBoostWhenAvailable = enabled;
}

- (BOOL)isVideoHDREnabled {
  return _videoHDREnabled;
}

- (void)setVideoHDREnabled:(BOOL)enabled {
  _videoHDREnabled = enabled;
}

- (BOOL)automaticallyAdjustsVideoHDREnabled {
  return _automaticallyAdjustsVideoHDREnabled;
}

- (void)setAutomaticallyAdjustsVideoHDREnabled:(BOOL)enabled {
  _automaticallyAdjustsVideoHDREnabled = enabled;
}

- (AVCaptureColorSpace)activeColorSpace {
  return _activeColorSpace;
}

- (void)setActiveColorSpace:(AVCaptureColorSpace)colorSpace {
  _activeColorSpace = colorSpace;
}

- (BOOL)isGeometricDistortionCorrectionSupported {
  return YES;
}

- (BOOL)isGeometricDistortionCorrectionEnabled {
  return _geometricDistortionCorrectionEnabled;
}

- (void)setGeometricDistortionCorrectionEnabled:(BOOL)enabled {
  _geometricDistortionCorrectionEnabled = enabled;
}

- (BOOL)isCenterStageActive {
  return NO;
}

- (BOOL)isPortraitEffectActive {
  return NO;
}

- (BOOL)isStudioLightActive {
  return NO;
}

- (BOOL)isBackgroundReplacementActive {
  return NO;
}

- (BOOL)isGlobalToneMappingEnabled {
  return NO;
}

- (BOOL)isEqual:(id)object {
  return self == object;
}

- (NSUInteger)hash {
  return (NSUInteger)(__bridge void *)self;
}

- (NSString *)description {
  return [NSString stringWithFormat:@"<FakeCameraDevice %@ (%@, %ld formats)>", _spec.uniqueID, _spec.deviceType, (long)_fakeFormats.count];
}

- (NSString *)debugDescription {
  return self.description;
}

FAKECAM_FORWARDING_NET

@end

// MARK: - AVCaptureInputPort

@implementation FakeCameraInputPort {
  __weak AVCaptureInput *_fakeInput;
  FakeCameraDevice *_fakeDevice;
  BOOL _enabled;
}

+ (instancetype)portForInput:(AVCaptureInput *)input device:(FakeCameraDevice *)device {
  FakeCameraInputPort *port = createInstance(self);
  port->_fakeInput = input;
  port->_fakeDevice = device;
  port->_enabled = YES;
  return port;
}

- (AVCaptureInput *)fakeInput {
  return _fakeInput;
}

- (FakeCameraDevice *)fakeDevice {
  return _fakeDevice;
}

- (AVCaptureInput *)input {
  return _fakeInput;
}

- (AVMediaType)mediaType {
  return AVMediaTypeVideo;
}

- (CMFormatDescriptionRef)formatDescription {
  return _fakeDevice.activeFormat.formatDescription;
}

- (BOOL)isEnabled {
  return _enabled;
}

- (void)setEnabled:(BOOL)enabled {
  _enabled = enabled;
}

- (AVCaptureDeviceType)sourceDeviceType {
  return _fakeDevice.deviceType;
}

- (AVCaptureDevicePosition)sourceDevicePosition {
  return _fakeDevice.position;
}

- (CMClockRef)clock {
  return CMClockGetHostTimeClock();
}

- (BOOL)isEqual:(id)object {
  return self == object;
}

- (NSUInteger)hash {
  return (NSUInteger)(__bridge void *)self;
}

- (NSString *)description {
  return [NSString stringWithFormat:@"<FakeCameraInputPort %@>", _fakeDevice.uniqueID];
}

- (NSString *)debugDescription {
  return self.description;
}

FAKECAM_FORWARDING_NET

@end

// MARK: - AVCaptureConnection

@implementation FakeCameraConnection {
  NSArray<AVCaptureInputPort *> *_inputPorts;
  __weak AVCaptureOutput *_output;
  __weak AVCaptureVideoPreviewLayer *_videoPreviewLayer;
  BOOL _enabled;
  AVCaptureVideoOrientation _videoOrientation;
  BOOL _videoMirrored;
  BOOL _automaticallyAdjustsVideoMirroring;
  AVCaptureVideoStabilizationMode _preferredVideoStabilizationMode;
  BOOL _cameraIntrinsicMatrixDeliveryEnabled;
  CGFloat _videoScaleAndCropFactor;
}

+ (instancetype)connectionWithInputPorts:(NSArray<AVCaptureInputPort *> *)ports output:(AVCaptureOutput *)output {
  FakeCameraConnection *connection = createInstance(self);
  connection->_inputPorts = [ports copy];
  connection->_output = output;
  [connection reset];
  return connection;
}

+ (instancetype)connectionWithInputPort:(AVCaptureInputPort *)port videoPreviewLayer:(AVCaptureVideoPreviewLayer *)layer {
  FakeCameraConnection *connection = createInstance(self);
  connection->_inputPorts = @[ port ];
  connection->_videoPreviewLayer = layer;
  [connection reset];
  return connection;
}

- (void)reset {
  _enabled = YES;
  _videoOrientation = AVCaptureVideoOrientationPortrait;
  _automaticallyAdjustsVideoMirroring = YES;
  _videoMirrored = self.fakeDevice.position == AVCaptureDevicePositionFront;
  _preferredVideoStabilizationMode = AVCaptureVideoStabilizationModeOff;
  _videoScaleAndCropFactor = 1.0;
}

- (FakeCameraDevice *)fakeDevice {
  for (AVCaptureInputPort *port in _inputPorts) {
    if ([port isKindOfClass:[FakeCameraInputPort class]]) {
      return ((FakeCameraInputPort *)port).fakeDevice;
    }
  }
  return nil;
}

- (NSArray<AVCaptureInputPort *> *)inputPorts {
  return _inputPorts;
}

- (AVCaptureOutput *)output {
  return _output;
}

- (AVCaptureVideoPreviewLayer *)videoPreviewLayer {
  return _videoPreviewLayer;
}

- (BOOL)isEnabled {
  return _enabled;
}

- (void)setEnabled:(BOOL)enabled {
  _enabled = enabled;
}

- (BOOL)isActive {
  return _enabled;
}

- (NSArray *)audioChannels {
  return @[];
}

- (AVMediaType)mediaType {
  return AVMediaTypeVideo;
}

- (BOOL)isVideoOrientationSupported {
  return YES;
}

- (AVCaptureVideoOrientation)videoOrientation {
  return _videoOrientation;
}

- (void)setVideoOrientation:(AVCaptureVideoOrientation)orientation {
  _videoOrientation = orientation;
}

- (BOOL)isVideoRotationAngleSupported:(CGFloat)angle {
  return YES;
}

- (CGFloat)videoRotationAngle {
  switch (_videoOrientation) {
    case AVCaptureVideoOrientationPortrait:
      return 90.0;
    case AVCaptureVideoOrientationPortraitUpsideDown:
      return 270.0;
    case AVCaptureVideoOrientationLandscapeRight:
      return 0.0;
    case AVCaptureVideoOrientationLandscapeLeft:
      return 180.0;
  }
  return 90.0;
}

- (void)setVideoRotationAngle:(CGFloat)angle {
  long normalized = ((long)angle % 360 + 360) % 360;
  if (normalized == 0) {
    _videoOrientation = AVCaptureVideoOrientationLandscapeRight;
  } else if (normalized == 90) {
    _videoOrientation = AVCaptureVideoOrientationPortrait;
  } else if (normalized == 180) {
    _videoOrientation = AVCaptureVideoOrientationLandscapeLeft;
  } else if (normalized == 270) {
    _videoOrientation = AVCaptureVideoOrientationPortraitUpsideDown;
  }
}

- (BOOL)isVideoMirroringSupported {
  return YES;
}

- (BOOL)isVideoMirrored {
  return _videoMirrored;
}

- (void)setVideoMirrored:(BOOL)mirrored {
  _videoMirrored = mirrored;
}

- (BOOL)automaticallyAdjustsVideoMirroring {
  return _automaticallyAdjustsVideoMirroring;
}

- (void)setAutomaticallyAdjustsVideoMirroring:(BOOL)automatically {
  _automaticallyAdjustsVideoMirroring = automatically;
  if (automatically) {
    _videoMirrored = self.fakeDevice.position == AVCaptureDevicePositionFront;
  }
}

- (BOOL)isVideoStabilizationSupported {
  return self.fakeDevice.spec.formats.count > 0 && ((FakeCameraFormat *)self.fakeDevice.activeFormat).spec.videoStabilizationModes.count > 0;
}

- (AVCaptureVideoStabilizationMode)preferredVideoStabilizationMode {
  return _preferredVideoStabilizationMode;
}

- (void)setPreferredVideoStabilizationMode:(AVCaptureVideoStabilizationMode)mode {
  _preferredVideoStabilizationMode = mode;
}

- (AVCaptureVideoStabilizationMode)activeVideoStabilizationMode {
  if ([self.fakeDevice.activeFormat isVideoStabilizationModeSupported:_preferredVideoStabilizationMode]) {
    return _preferredVideoStabilizationMode;
  }
  return AVCaptureVideoStabilizationModeOff;
}

- (BOOL)isCameraIntrinsicMatrixDeliverySupported {
  return NO;
}

- (BOOL)isCameraIntrinsicMatrixDeliveryEnabled {
  return _cameraIntrinsicMatrixDeliveryEnabled;
}

- (void)setCameraIntrinsicMatrixDeliveryEnabled:(BOOL)enabled {
  _cameraIntrinsicMatrixDeliveryEnabled = enabled;
}

- (BOOL)isVideoFieldModeSupported {
  return NO;
}

- (CGFloat)videoMaxScaleAndCropFactor {
  return 1.0;
}

- (CGFloat)videoScaleAndCropFactor {
  return _videoScaleAndCropFactor;
}

- (void)setVideoScaleAndCropFactor:(CGFloat)factor {
  _videoScaleAndCropFactor = factor;
}

- (BOOL)isVideoMinFrameDurationSupported {
  return NO;
}

- (BOOL)isVideoMaxFrameDurationSupported {
  return NO;
}

- (BOOL)isEqual:(id)object {
  return self == object;
}

- (NSUInteger)hash {
  return (NSUInteger)(__bridge void *)self;
}

- (NSString *)description {
  return [NSString stringWithFormat:@"<FakeCameraConnection %@ -> %@>", self.fakeDevice.uniqueID, _output ?: (id)_videoPreviewLayer];
}

- (NSString *)debugDescription {
  return self.description;
}

FAKECAM_FORWARDING_NET

@end

// MARK: - Registry

static const void *kInputDeviceKey = &kInputDeviceKey;
static const void *kInputPortKey = &kInputPortKey;

@implementation FakeCameraRegistry {
  FakeCameraCatalog *_catalog;
  NSArray<FakeCameraDevice *> *_devices;
  CGImageRef _sceneImage;
  NSMutableArray *_retained;
  AVCaptureDevice *_userPreferredCamera;
}

+ (FakeCameraRegistry *)shared {
  static FakeCameraRegistry *shared;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    shared = [FakeCameraRegistry new];
  });
  return shared;
}

- (instancetype)init {
  if ((self = [super init])) {
    _devices = @[];
    _retained = [NSMutableArray array];
  }
  return self;
}

- (FakeCameraCatalog *)catalog {
  return _catalog;
}

- (NSArray<FakeCameraDevice *> *)devices {
  return _devices;
}

- (CGImageRef)sceneImage {
  return _sceneImage;
}

- (AVCaptureDevice *)userPreferredCamera {
  return _userPreferredCamera;
}

- (void)setUserPreferredCamera:(AVCaptureDevice *)userPreferredCamera {
  _userPreferredCamera = userPreferredCamera;
}

- (void)installCatalog:(FakeCameraCatalog *)catalog sceneImage:(CGImageRef)sceneImage {
  _catalog = catalog;
  _sceneImage = CGImageRetain(sceneImage);
  NSMutableArray *devices = [NSMutableArray array];
  for (FakeCameraDeviceSpec *spec in catalog.devices) {
    [devices addObject:[FakeCameraDevice deviceWithSpec:spec]];
  }
  _devices = devices;
}

- (FakeCameraDevice *)deviceWithUniqueID:(NSString *)uniqueID {
  for (FakeCameraDevice *device in _devices) {
    if ([device.uniqueID isEqualToString:uniqueID]) {
      return device;
    }
  }
  return nil;
}

- (FakeCameraDevice *)defaultDeviceOfType:(AVCaptureDeviceType)deviceType position:(AVCaptureDevicePosition)position {
  for (FakeCameraDevice *device in _devices) {
    BOOL typeMatches = deviceType == nil || [device.deviceType isEqualToString:deviceType];
    BOOL positionMatches = position == AVCaptureDevicePositionUnspecified || device.position == position;
    if (typeMatches && positionMatches) {
      return device;
    }
  }
  return nil;
}

- (NSArray<FakeCameraDevice *> *)devicesOfTypes:(NSArray<AVCaptureDeviceType> *)deviceTypes position:(AVCaptureDevicePosition)position {
  NSMutableArray *matches = [NSMutableArray array];
  for (FakeCameraDevice *device in _devices) {
    BOOL typeMatches = deviceTypes == nil || [deviceTypes containsObject:device.deviceType];
    BOOL positionMatches = position == AVCaptureDevicePositionUnspecified || device.position == position;
    if (typeMatches && positionMatches) {
      [matches addObject:device];
    }
  }
  return matches;
}

- (void)retainForever:(id)object {
  @synchronized(_retained) {
    [_retained addObject:object];
  }
}

@end

BOOL FakeCameraIsFakeDevice(id object) {
  return [object isKindOfClass:[FakeCameraDevice class]];
}

BOOL FakeCameraIsFakeInput(id input) {
  return input != nil && objc_getAssociatedObject(input, kInputDeviceKey) != nil;
}

void FakeCameraTagInput(AVCaptureInput *input, FakeCameraDevice *device) {
  objc_setAssociatedObject(input, kInputDeviceKey, device, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(input, kInputPortKey, [FakeCameraInputPort portForInput:input device:device], OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  [FakeCameraRegistry.shared retainForever:input];
}

FakeCameraDevice *FakeCameraDeviceForInput(id input) {
  return input == nil ? nil : objc_getAssociatedObject(input, kInputDeviceKey);
}

FakeCameraInputPort *FakeCameraPortForInput(id input) {
  return input == nil ? nil : objc_getAssociatedObject(input, kInputPortKey);
}
