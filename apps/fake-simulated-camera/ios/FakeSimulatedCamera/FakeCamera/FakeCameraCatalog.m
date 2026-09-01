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

// A second catalog that exercises catalog robustness: two near-identical back cameras that differ ONLY in
// maxZoom, plus a front camera. A different device set than `default` proves nothing is hardcoded to it.
static FakeCameraFormatSpec *variantFormat(void) {
  return makeFormat(@"1080p60", 1920, 1080, kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange, @[ @[ @1, @60 ] ],
                    @[ dimensions(1920, 1080) ], AVCaptureAutoFocusSystemPhaseDetection,
                    @[ @(AVCaptureVideoStabilizationModeStandard) ], NO, NO, @[ @(AVCaptureColorSpace_sRGB) ], NO, NO,
                    YES);
}

static NSArray<FakeCameraDeviceSpec *> *fakeCameraVariantDevices(void) {
  // A DIFFERENT count and shape than `default` (4 devices vs 3): near-identical twins differing only in maxZoom,
  // a telephoto (different type), and a front camera. Proves the pipeline is not hardcoded to the default set.
  FakeCameraDeviceSpec *twinA = makeDevice(@"fake-twin-a", @"Fake Twin A", AVCaptureDeviceTypeBuiltInWideAngleCamera,
                                           AVCaptureDevicePositionBack, YES, YES, 1, 4, 1.8f, 26, YES,
                                           @[ variantFormat() ]);
  FakeCameraDeviceSpec *twinB = makeDevice(@"fake-twin-b", @"Fake Twin B", AVCaptureDeviceTypeBuiltInWideAngleCamera,
                                           AVCaptureDevicePositionBack, YES, YES, 1, 6, 1.8f, 26, YES,
                                           @[ variantFormat() ]);
  // Near-identical to twin-a but its one format tops out at 30 fps instead of 60 — supportsFPS(60) differs.
  FakeCameraDeviceSpec *slowFps = makeDevice(
      @"fake-slow-fps", @"Fake Slow FPS", AVCaptureDeviceTypeBuiltInWideAngleCamera, AVCaptureDevicePositionBack, YES,
      YES, 1, 4, 1.8f, 26, YES,
      @[ makeFormat(@"1080p30", 1920, 1080, kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange, @[ @[ @1, @30 ] ],
                    @[ dimensions(1920, 1080) ], AVCaptureAutoFocusSystemPhaseDetection,
                    @[ @(AVCaptureVideoStabilizationModeStandard) ], NO, NO, @[ @(AVCaptureColorSpace_sRGB) ], NO, NO,
                    YES) ]);
  // Near-identical to twin-a but its one format is HDR (10-bit) — supportedVideoDynamicRanges differs.
  FakeCameraDeviceSpec *hdr = makeDevice(
      @"fake-hdr-variant", @"Fake HDR Variant", AVCaptureDeviceTypeBuiltInWideAngleCamera, AVCaptureDevicePositionBack,
      YES, YES, 1, 4, 1.8f, 26, YES,
      @[ makeFormat(@"1080p30-hdr", 1920, 1080, kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange, @[ @[ @1, @30 ] ],
                    @[ dimensions(1920, 1080) ], AVCaptureAutoFocusSystemPhaseDetection,
                    @[ @(AVCaptureVideoStabilizationModeStandard) ], NO, YES,
                    @[ @(AVCaptureColorSpace_sRGB), @(AVCaptureColorSpace_HLG_BT2020) ], NO, NO, NO) ]);
  FakeCameraDeviceSpec *tele = makeDevice(@"fake-variant-tele", @"Fake Variant Telephoto",
                                          AVCaptureDeviceTypeBuiltInTelephotoCamera, AVCaptureDevicePositionBack, YES,
                                          YES, 1, 3, 2.8f, 77, YES, @[ variantFormat() ]);
  FakeCameraDeviceSpec *front = makeDevice(@"fake-variant-front", @"Fake Variant Front",
                                           AVCaptureDeviceTypeBuiltInWideAngleCamera, AVCaptureDevicePositionFront, NO,
                                           NO, 1, 1, 2.2f, 23, NO,
                                           @[ makeFormat(@"1080p60", 1920, 1080,
                                                         kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange, @[ @[ @1, @60 ] ],
                                                         @[ dimensions(1920, 1080) ], AVCaptureAutoFocusSystemNone, @[], NO,
                                                         NO, @[ @(AVCaptureColorSpace_sRGB) ], NO, NO, NO) ]);
  // Two devices identical in every capability, differing ONLY in id (and display name): both must enumerate and
  // round-trip to themselves — the pipeline must never dedupe capability-identical devices.
  FakeCameraDeviceSpec *cloneA = makeDevice(@"fake-clone-a", @"Fake Clone A",
                                            AVCaptureDeviceTypeBuiltInWideAngleCamera, AVCaptureDevicePositionBack, YES,
                                            YES, 1, 5, 2.0f, 28, YES, @[ variantFormat() ]);
  FakeCameraDeviceSpec *cloneB = makeDevice(@"fake-clone-b", @"Fake Clone B",
                                            AVCaptureDeviceTypeBuiltInWideAngleCamera, AVCaptureDevicePositionBack, YES,
                                            YES, 1, 5, 2.0f, 28, YES, @[ variantFormat() ]);
  return @[ twinA, twinB, slowFps, hdr, tele, front, cloneA, cloneB ];
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
  catalog->_devices = [name isEqualToString:@"variants"] ? fakeCameraVariantDevices() : fakeCameraDevices();
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
