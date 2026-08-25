#import "FakeCameraDiscovery.h"

#import <AVFoundation/AVFoundation.h>
#import <objc/message.h>
#import <objc/runtime.h>

#import "FakeCameraLog.h"
#import "FakeCameraObjects.h"
#import "FakeCameraSwizzle.h"

static const void *kDiscoveryTypesKey = &kDiscoveryTypesKey;
static const void *kDiscoveryMediaTypeKey = &kDiscoveryMediaTypeKey;
static const void *kDiscoveryPositionKey = &kDiscoveryPositionKey;

static IMP originalDefaultDeviceWithType;
static IMP originalDefaultDeviceWithMediaType;
static IMP originalDevicesWithMediaType;
static IMP originalDevices;
static IMP originalDeviceWithUniqueID;
static IMP originalAuthorizationStatus;
static IMP originalRequestAccess;
static IMP originalDiscoveryFactory;
static IMP originalDiscoveryDevices;
static IMP originalDiscoveryMultiCamSets;

static BOOL isVideo(AVMediaType mediaType) {
  return mediaType == nil || [mediaType isEqualToString:AVMediaTypeVideo];
}

// MARK: - AVCaptureDevice class methods

static AVCaptureDevice *defaultDeviceWithType(id self, SEL _cmd, AVCaptureDeviceType deviceType, AVMediaType mediaType, AVCaptureDevicePosition position) {
  if (isVideo(mediaType)) {
    return [FakeCameraRegistry.shared defaultDeviceOfType:deviceType position:position];
  }
  return ((AVCaptureDevice * (*)(id, SEL, AVCaptureDeviceType, AVMediaType, AVCaptureDevicePosition)) originalDefaultDeviceWithType)(self, _cmd, deviceType, mediaType, position);
}

static AVCaptureDevice *defaultDeviceWithMediaType(id self, SEL _cmd, AVMediaType mediaType) {
  if (isVideo(mediaType)) {
    return [FakeCameraRegistry.shared defaultDeviceOfType:nil position:AVCaptureDevicePositionBack] ?: FakeCameraRegistry.shared.devices.firstObject;
  }
  return ((AVCaptureDevice * (*)(id, SEL, AVMediaType)) originalDefaultDeviceWithMediaType)(self, _cmd, mediaType);
}

static NSArray *devicesWithMediaType(id self, SEL _cmd, AVMediaType mediaType) {
  if (isVideo(mediaType)) {
    return FakeCameraRegistry.shared.devices;
  }
  return ((NSArray * (*)(id, SEL, AVMediaType)) originalDevicesWithMediaType)(self, _cmd, mediaType);
}

static NSArray *devices(id self, SEL _cmd) {
  NSArray *original = originalDevices ? ((NSArray * (*)(id, SEL)) originalDevices)(self, _cmd) : @[];
  return [FakeCameraRegistry.shared.devices arrayByAddingObjectsFromArray:original ?: @[]];
}

static AVCaptureDevice *deviceWithUniqueID(id self, SEL _cmd, NSString *uniqueID) {
  FakeCameraDevice *device = [FakeCameraRegistry.shared deviceWithUniqueID:uniqueID];
  if (device != nil) {
    return device;
  }
  return ((AVCaptureDevice * (*)(id, SEL, NSString *)) originalDeviceWithUniqueID)(self, _cmd, uniqueID);
}

static AVAuthorizationStatus authorizationStatus(id self, SEL _cmd, AVMediaType mediaType) {
  if (isVideo(mediaType)) {
    return AVAuthorizationStatusAuthorized;
  }
  return ((AVAuthorizationStatus(*)(id, SEL, AVMediaType))originalAuthorizationStatus)(self, _cmd, mediaType);
}

static void requestAccess(id self, SEL _cmd, AVMediaType mediaType, void (^handler)(BOOL)) {
  if (isVideo(mediaType)) {
    if (handler) {
      dispatch_async(dispatch_get_main_queue(), ^{
        handler(YES);
      });
    }
    return;
  }
  ((void (*)(id, SEL, AVMediaType, void (^)(BOOL)))originalRequestAccess)(self, _cmd, mediaType, handler);
}

static AVCaptureDevice *userPreferredCamera(id self, SEL _cmd) {
  return FakeCameraRegistry.shared.userPreferredCamera;
}

static void setUserPreferredCamera(id self, SEL _cmd, AVCaptureDevice *device) {
  FakeCameraRegistry.shared.userPreferredCamera = device;
}

static AVCaptureDevice *systemPreferredCamera(id self, SEL _cmd) {
  return FakeCameraRegistry.shared.userPreferredCamera ?: [FakeCameraRegistry.shared defaultDeviceOfType:nil position:AVCaptureDevicePositionBack];
}

// MARK: - AVCaptureDeviceDiscoverySession

static id discoveryFactory(id self, SEL _cmd, NSArray<AVCaptureDeviceType> *deviceTypes, AVMediaType mediaType, AVCaptureDevicePosition position) {
  id session = ((id(*)(id, SEL, NSArray *, AVMediaType, AVCaptureDevicePosition))originalDiscoveryFactory)(self, _cmd, deviceTypes, mediaType, position);
  if (session != nil) {
    objc_setAssociatedObject(session, kDiscoveryTypesKey, deviceTypes, OBJC_ASSOCIATION_COPY_NONATOMIC);
    objc_setAssociatedObject(session, kDiscoveryMediaTypeKey, mediaType, OBJC_ASSOCIATION_COPY_NONATOMIC);
    objc_setAssociatedObject(session, kDiscoveryPositionKey, @(position), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }
  return session;
}

static BOOL discoveryIsVideo(id session) {
  return objc_getAssociatedObject(session, kDiscoveryPositionKey) != nil && isVideo(objc_getAssociatedObject(session, kDiscoveryMediaTypeKey));
}

static NSArray *discoveryDevices(id self, SEL _cmd) {
  if (discoveryIsVideo(self)) {
    NSArray *types = objc_getAssociatedObject(self, kDiscoveryTypesKey);
    AVCaptureDevicePosition position = [objc_getAssociatedObject(self, kDiscoveryPositionKey) integerValue];
    return [FakeCameraRegistry.shared devicesOfTypes:types position:position];
  }
  return ((NSArray * (*)(id, SEL)) originalDiscoveryDevices)(self, _cmd);
}

static NSArray *discoveryMultiCamSets(id self, SEL _cmd) {
  if (discoveryIsVideo(self)) {
    return @[];
  }
  return ((NSArray * (*)(id, SEL)) originalDiscoveryMultiCamSets)(self, _cmd);
}

void FakeCameraInstallDiscoveryHooks(void) {
  Class device = [AVCaptureDevice class];
  originalDefaultDeviceWithType = FakeCameraReplaceClassMethod(device, @selector(defaultDeviceWithDeviceType:mediaType:position:), (IMP)defaultDeviceWithType, "@@:@@q");
  originalDefaultDeviceWithMediaType = FakeCameraReplaceClassMethod(device, @selector(defaultDeviceWithMediaType:), (IMP)defaultDeviceWithMediaType, "@@:@");
  originalDevicesWithMediaType = FakeCameraReplaceClassMethod(device, @selector(devicesWithMediaType:), (IMP)devicesWithMediaType, "@@:@");
  originalDevices = FakeCameraReplaceClassMethod(device, @selector(devices), (IMP)devices, "@@:");
  originalDeviceWithUniqueID = FakeCameraReplaceClassMethod(device, @selector(deviceWithUniqueID:), (IMP)deviceWithUniqueID, "@@:@");
  originalAuthorizationStatus = FakeCameraReplaceClassMethod(device, @selector(authorizationStatusForMediaType:), (IMP)authorizationStatus, "q@:@");
  originalRequestAccess = FakeCameraReplaceClassMethod(device, @selector(requestAccessForMediaType:completionHandler:), (IMP)requestAccess, "v@:@@?");
  if (@available(iOS 17.0, *)) {
    FakeCameraReplaceClassMethod(device, @selector(userPreferredCamera), (IMP)userPreferredCamera, "@@:");
    FakeCameraReplaceClassMethod(device, @selector(setUserPreferredCamera:), (IMP)setUserPreferredCamera, "v@:@");
    FakeCameraReplaceClassMethod(device, @selector(systemPreferredCamera), (IMP)systemPreferredCamera, "@@:");
  }

  Class discovery = [AVCaptureDeviceDiscoverySession class];
  originalDiscoveryFactory = FakeCameraReplaceClassMethod(discovery, @selector(discoverySessionWithDeviceTypes:mediaType:position:), (IMP)discoveryFactory, "@@:@@q");
  originalDiscoveryDevices = FakeCameraReplaceInstanceMethod(discovery, @selector(devices), (IMP)discoveryDevices, "@@:");
  originalDiscoveryMultiCamSets = FakeCameraReplaceInstanceMethod(discovery, @selector(supportedMultiCamDeviceSets), (IMP)discoveryMultiCamSets, "@@:");
  FAKECAM_INFO("discovery hooks installed for %{public}lu devices", (unsigned long)FakeCameraRegistry.shared.devices.count);
}
