#import "FakeCameraCatalog.h"

NSErrorDomain const FakeCameraErrorDomain = @"com.margelo.fakecamera";

static NSString *const kSceneFileName = @"qr-code-margelo.png";

@implementation FakeCameraFormatSpec
@end

@implementation FakeCameraDeviceSpec
@end

// The fake cameras are authored directly against AVFoundation types here (no JSON). Every value is the native
// constant the library reads, so the fake is faithful by construction and the specs are compile-checked.

static NSValue *dimensions(int32_t width, int32_t height) {
  CMVideoDimensions value = {width, height};
  return [NSValue valueWithBytes:&value objCType:@encode(CMVideoDimensions)];
}

static FakeCameraFormatSpec *makeFormat(NSString *name,
                                        int32_t width,
                                        int32_t height,
                                        OSType pixelFormat,
                                        NSArray<NSArray<NSNumber *> *> *fpsRanges,
                                        NSArray<NSValue *> *photoDimensions,
                                        AVCaptureAutoFocusSystem autoFocusSystem,
                                        NSArray<NSNumber *> *stabilizationModes,
                                        BOOL binned,
                                        BOOL videoHDR,
                                        NSArray<NSNumber *> *colorSpaces,
                                        BOOL highestPhotoQuality,
                                        BOOL highPhotoQuality,
                                        BOOL multiCam) {
  FakeCameraFormatSpec *spec = [FakeCameraFormatSpec new];
  spec.name = name;
  spec.width = width;
  spec.height = height;
  spec.pixelFormatType = pixelFormat;
  spec.fpsRanges = fpsRanges;
  spec.photoDimensions = photoDimensions;
  spec.autoFocusSystem = autoFocusSystem;
  spec.videoStabilizationModes = stabilizationModes;
  spec.binned = binned;
  spec.videoHDR = videoHDR;
  spec.colorSpaces = colorSpaces;
  spec.highestPhotoQuality = highestPhotoQuality;
  spec.highPhotoQuality = highPhotoQuality;
  spec.multiCam = multiCam;
  return spec;
}

static FakeCameraDeviceSpec *makeDevice(NSString *uniqueID,
                                        NSString *name,
                                        AVCaptureDeviceType deviceType,
                                        AVCaptureDevicePosition position,
                                        BOOL hasFlash,
                                        BOOL hasTorch,
                                        CGFloat minZoom,
                                        CGFloat maxZoom,
                                        float lensAperture,
                                        int32_t focalLength,
                                        BOOL supportsFocus,
                                        NSArray<FakeCameraFormatSpec *> *formats) {
  FakeCameraDeviceSpec *spec = [FakeCameraDeviceSpec new];
  spec.uniqueID = uniqueID;
  spec.name = name;
  spec.modelID = @"FakeCamera,1";
  spec.deviceType = deviceType;
  spec.position = position;
  spec.hasFlash = hasFlash;
  spec.hasTorch = hasTorch;
  spec.minZoom = minZoom;
  spec.maxZoom = maxZoom;
  spec.lensAperture = lensAperture;
  spec.focalLength = focalLength;
  spec.minExposureBias = -8;
  spec.maxExposureBias = 8;
  spec.supportsFocus = supportsFocus;
  spec.supportsExposure = YES;
  spec.supportsWhiteBalance = YES;
  spec.supportsLowLightBoost = NO;
  spec.formats = formats;
  return spec;
}

static NSArray<FakeCameraDeviceSpec *> *fakeCameraDevices(void) {
  FakeCameraDeviceSpec *backWide = makeDevice(
      @"fake-back-wide", @"Fake Back Wide Camera", AVCaptureDeviceTypeBuiltInWideAngleCamera, AVCaptureDevicePositionBack,
      /* flash */ YES, /* torch */ YES, /* zoom */ 1, 6, /* aperture */ 1.6f, /* focal */ 24, /* focus */ YES,
      @[
        makeFormat(@"1080p60", 1920, 1080, kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange, @[ @[ @1, @60 ] ],
                   @[ dimensions(1920, 1080) ], AVCaptureAutoFocusSystemPhaseDetection,
                   @[ @(AVCaptureVideoStabilizationModeStandard), @(AVCaptureVideoStabilizationModeCinematic) ],
                   /* binned */ NO, /* hdr */ NO, @[ @(AVCaptureColorSpace_sRGB) ], /* highest */ NO, /* high */ NO,
                   /* multiCam */ YES),
        makeFormat(@"4k30", 3840, 2160, kCVPixelFormatType_420YpCbCr8BiPlanarFullRange, @[ @[ @1, @30 ] ],
                   @[ dimensions(4032, 3024), dimensions(3840, 2160) ], AVCaptureAutoFocusSystemPhaseDetection,
                   @[ @(AVCaptureVideoStabilizationModeStandard) ], NO, NO,
                   @[ @(AVCaptureColorSpace_sRGB), @(AVCaptureColorSpace_P3_D65) ], YES, YES, NO),
        makeFormat(@"1080p30-hdr", 1920, 1080, kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange, @[ @[ @1, @30 ] ],
                   @[ dimensions(1920, 1080) ], AVCaptureAutoFocusSystemPhaseDetection,
                   @[ @(AVCaptureVideoStabilizationModeStandard), @(AVCaptureVideoStabilizationModeCinematic) ], NO, YES,
                   @[ @(AVCaptureColorSpace_sRGB), @(AVCaptureColorSpace_P3_D65), @(AVCaptureColorSpace_HLG_BT2020) ], NO,
                   NO, NO),
        makeFormat(@"720p240-binned", 1280, 720, kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange, @[ @[ @1, @240 ] ],
                   @[ dimensions(1280, 720) ], AVCaptureAutoFocusSystemContrastDetection, @[], YES, NO,
                   @[ @(AVCaptureColorSpace_sRGB) ], NO, NO, YES),
      ]);

  FakeCameraDeviceSpec *ultraWide = makeDevice(
      @"fake-back-ultra-wide", @"Fake Back Ultra Wide Camera", AVCaptureDeviceTypeBuiltInUltraWideCamera,
      AVCaptureDevicePositionBack, YES, YES, 1, 1, 2.4f, 13, /* focus */ NO,
      @[
        makeFormat(@"1080p30", 1920, 1080, kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange, @[ @[ @1, @30 ] ],
                   @[ dimensions(1920, 1080) ], AVCaptureAutoFocusSystemNone, @[], NO, NO,
                   @[ @(AVCaptureColorSpace_sRGB) ], NO, NO, NO),
      ]);

  FakeCameraDeviceSpec *front = makeDevice(
      @"fake-front-wide", @"Fake Front Camera", AVCaptureDeviceTypeBuiltInWideAngleCamera, AVCaptureDevicePositionFront,
      /* flash */ NO, /* torch */ NO, 1, 1, 2.2f, 23, /* focus */ NO,
      @[
        makeFormat(@"1080p60", 1920, 1080, kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange, @[ @[ @1, @60 ] ],
                   @[ dimensions(1920, 1080) ], AVCaptureAutoFocusSystemNone,
                   @[ @(AVCaptureVideoStabilizationModeStandard) ], NO, NO, @[ @(AVCaptureColorSpace_sRGB) ], NO, NO, YES),
        makeFormat(@"720p30", 1280, 720, kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange, @[ @[ @1, @30 ] ],
                   @[ dimensions(1280, 720) ], AVCaptureAutoFocusSystemNone, @[], NO, NO,
                   @[ @(AVCaptureColorSpace_sRGB) ], NO, NO, NO),
      ]);

  return @[ backWide, ultraWide, front ];
}

@implementation FakeCameraCatalog {
  NSString *_name;
  NSString *_sceneFileName;
  NSURL *_sceneURL;
  NSArray<FakeCameraDeviceSpec *> *_devices;
}

+ (instancetype)catalogNamed:(NSString *)name bundle:(NSBundle *)bundle error:(NSError **)error {
  FakeCameraCatalog *catalog = [FakeCameraCatalog new];
  catalog->_name = [name copy];
  catalog->_sceneFileName = kSceneFileName;
  catalog->_sceneURL = [bundle URLForResource:kSceneFileName withExtension:nil subdirectory:@"scenes"];
  if (catalog->_sceneURL == nil) {
    if (error) {
      *error = [NSError errorWithDomain:FakeCameraErrorDomain
                                   code:1
                               userInfo:@{NSLocalizedDescriptionKey : [NSString stringWithFormat:@"scenes/%@ is not bundled", kSceneFileName]}];
    }
    return nil;
  }
  catalog->_devices = fakeCameraDevices();
  return catalog;
}

- (NSString *)name {
  return _name;
}

- (NSString *)sceneFileName {
  return _sceneFileName;
}

- (NSURL *)sceneURL {
  return _sceneURL;
}

- (NSArray<FakeCameraDeviceSpec *> *)devices {
  return _devices;
}

@end
