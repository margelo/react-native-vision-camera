#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

FOUNDATION_EXPORT NSErrorDomain const FakeCameraErrorDomain;

/// One `AVCaptureDevice.Format` of a fake device (authored in `FakeCameraCatalog.m`).
@interface FakeCameraFormatSpec : NSObject
@property (nonatomic, copy) NSString *name;
@property (nonatomic) int32_t width;
@property (nonatomic) int32_t height;
@property (nonatomic) OSType pixelFormatType;
/// Pairs of `[min, max]` frame rates.
@property (nonatomic, copy) NSArray<NSArray<NSNumber *> *> *fpsRanges;
/// `CMVideoDimensions` boxed in `NSValue`s.
@property (nonatomic, copy) NSArray<NSValue *> *photoDimensions;
@property (nonatomic) AVCaptureAutoFocusSystem autoFocusSystem;
/// `AVCaptureVideoStabilizationMode` raw values.
@property (nonatomic, copy) NSArray<NSNumber *> *videoStabilizationModes;
@property (nonatomic) BOOL binned;
@property (nonatomic) BOOL videoHDR;
/// `AVCaptureColorSpace` raw values.
@property (nonatomic, copy) NSArray<NSNumber *> *colorSpaces;
@property (nonatomic) BOOL highestPhotoQuality;
@property (nonatomic) BOOL highPhotoQuality;
@property (nonatomic) BOOL multiCam;
@end

/// One `AVCaptureDevice` of the catalog.
@interface FakeCameraDeviceSpec : NSObject
@property (nonatomic, copy) NSString *uniqueID;
@property (nonatomic, copy) NSString *name;
@property (nonatomic, copy) NSString *modelID;
@property (nonatomic, copy) AVCaptureDeviceType deviceType;
@property (nonatomic) AVCaptureDevicePosition position;
@property (nonatomic) BOOL hasFlash;
@property (nonatomic) BOOL hasTorch;
@property (nonatomic) CGFloat minZoom;
@property (nonatomic) CGFloat maxZoom;
@property (nonatomic) float lensAperture;
@property (nonatomic) int32_t focalLength;
@property (nonatomic) float minExposureBias;
@property (nonatomic) float maxExposureBias;
@property (nonatomic) BOOL supportsFocus;
@property (nonatomic) BOOL supportsExposure;
@property (nonatomic) BOOL supportsWhiteBalance;
@property (nonatomic) BOOL supportsLowLightBoost;
@property (nonatomic, copy) NSArray<FakeCameraFormatSpec *> *formats;
@end

@interface FakeCameraCatalog : NSObject
@property (nonatomic, copy, readonly) NSString *name;
@property (nonatomic, copy, readonly) NSString *sceneFileName;
@property (nonatomic, copy, readonly) NSURL *sceneURL;
@property (nonatomic, copy, readonly) NSArray<FakeCameraDeviceSpec *> *devices;

/// Builds the natively-authored catalog for `name` (`"variants"` selects the robustness set, otherwise default) and
/// resolves its scene from `bundle`. Returns nil with an error only if the scene asset is missing.
+ (nullable instancetype)catalogNamed:(NSString *)name bundle:(NSBundle *)bundle error:(NSError **)error;
@end

NS_ASSUME_NONNULL_END
