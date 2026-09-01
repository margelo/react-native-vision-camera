#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>

#import "FakeCameraCatalog.h"

NS_ASSUME_NONNULL_BEGIN

// Fake AVFoundation objects. They are instantiated with `class_createInstance` (no `init` — AVFoundation forbids it),
// so every selector VisionCamera or AVFoundation may call on them is overridden here; anything else fails loudly
// through FAKECAM_FORWARDING_NET. Technique adapted from serve-sim (Apache-2.0) and FauxCam (MIT), see THIRD_PARTY.md.

@interface FakeCameraFrameRateRange : AVFrameRateRange
+ (instancetype)rangeWithMinFrameRate:(Float64)minFrameRate maxFrameRate:(Float64)maxFrameRate;
@end

@interface FakeCameraFormat : AVCaptureDeviceFormat
@property (nonatomic, readonly) FakeCameraFormatSpec *spec;
+ (instancetype)formatWithSpec:(FakeCameraFormatSpec *)spec;
@end

@interface FakeCameraDevice : AVCaptureDevice
@property (nonatomic, readonly) FakeCameraDeviceSpec *spec;
@property (nonatomic, readonly) NSArray<FakeCameraFormat *> *fakeFormats;
+ (instancetype)deviceWithSpec:(FakeCameraDeviceSpec *)spec;
@end

@interface FakeCameraInputPort : AVCaptureInputPort
@property (nonatomic, readonly, weak) AVCaptureInput *fakeInput;
@property (nonatomic, readonly) FakeCameraDevice *fakeDevice;
+ (instancetype)portForInput:(AVCaptureInput *)input device:(FakeCameraDevice *)device;
@end

@interface FakeCameraConnection : AVCaptureConnection
@property (nonatomic, readonly, nullable) FakeCameraDevice *fakeDevice;
+ (instancetype)connectionWithInputPorts:(NSArray<AVCaptureInputPort *> *)ports output:(AVCaptureOutput *)output;
+ (instancetype)connectionWithInputPort:(AVCaptureInputPort *)port videoPreviewLayer:(AVCaptureVideoPreviewLayer *)layer;
@end

/// Owns the catalog's devices and keeps every fake object alive (their real superclass `dealloc` must never run over
/// zeroed private state).
@interface FakeCameraRegistry : NSObject
@property (class, nonatomic, readonly) FakeCameraRegistry *shared;
@property (nonatomic, readonly, nullable) FakeCameraCatalog *catalog;
@property (nonatomic, readonly) NSArray<FakeCameraDevice *> *devices;
@property (nonatomic, readonly, nullable) CGImageRef sceneImage;
@property (nonatomic, strong, nullable) AVCaptureDevice *userPreferredCamera;

- (void)installCatalog:(FakeCameraCatalog *)catalog sceneImage:(CGImageRef)sceneImage;
- (nullable FakeCameraDevice *)deviceWithUniqueID:(NSString *)uniqueID;
- (nullable FakeCameraDevice *)defaultDeviceOfType:(nullable AVCaptureDeviceType)deviceType position:(AVCaptureDevicePosition)position;
- (NSArray<FakeCameraDevice *> *)devicesOfTypes:(nullable NSArray<AVCaptureDeviceType> *)deviceTypes position:(AVCaptureDevicePosition)position;
- (void)retainForever:(id)object;
@end

/// Tags applied to the real `AVCaptureDeviceInput` instances that VisionCamera creates for fake devices.
BOOL FakeCameraIsFakeDevice(id _Nullable object);
BOOL FakeCameraIsFakeInput(id _Nullable input);
void FakeCameraTagInput(AVCaptureInput *input, FakeCameraDevice *device);
FakeCameraDevice *_Nullable FakeCameraDeviceForInput(id _Nullable input);
FakeCameraInputPort *_Nullable FakeCameraPortForInput(id _Nullable input);

NS_ASSUME_NONNULL_END
