#import "FakeCamera.h"

#import <CommonCrypto/CommonDigest.h>
#import <UIKit/UIKit.h>

#import "FakeCameraCatalog.h"
#import "FakeCameraDiscovery.h"
#import "FakeCameraLog.h"
#import "FakeCameraObjects.h"
#import "FakeCameraSession.h"

static NSString *catalogName(void) {
  NSArray<NSString *> *arguments = NSProcessInfo.processInfo.arguments;
  NSUInteger index = [arguments indexOfObject:@"-FakeCameraCatalog"];
  if (index != NSNotFound && index + 1 < arguments.count) {
    return arguments[index + 1];
  }
  NSString *environment = NSProcessInfo.processInfo.environment[@"FAKE_CAMERA_CATALOG"];
  return environment.length > 0 ? environment : @"default";
}

static NSString *sha256(NSData *data) {
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
  NSMutableString *hex = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
  for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) {
    [hex appendFormat:@"%02x", digest[i]];
  }
  return hex;
}

void FakeCameraInstall(void) {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    NSString *name = catalogName();
    NSError *error;
    FakeCameraCatalog *catalog = [FakeCameraCatalog catalogNamed:name bundle:NSBundle.mainBundle error:&error];
    if (catalog == nil) {
      FAKECAM_FAULT("catalog %{public}@ unavailable: %{public}@", name, error.localizedDescription);
      [NSException raise:@"FakeCameraCatalog" format:@"catalog %@ unavailable: %@", name, error.localizedDescription];
    }
    NSData *sceneData = [NSData dataWithContentsOfURL:catalog.sceneURL];
    UIImage *scene = [UIImage imageWithData:sceneData];
    if (scene.CGImage == NULL) {
      [NSException raise:@"FakeCameraCatalog" format:@"scenes/%@ is not a decodable image", catalog.sceneFileName];
    }
    [FakeCameraRegistry.shared installCatalog:catalog sceneImage:scene.CGImage];
    FakeCameraInstallDiscoveryHooks();
    FakeCameraInstallSessionHooks();
    NSArray *ids = [FakeCameraRegistry.shared.devices valueForKey:@"uniqueID"];
    FAKECAM_INFO("mode=fake:%{public}@ devices=%{public}@ scene=%{public}@ sha256=%{public}@", name, [ids componentsJoinedByString:@","], catalog.sceneFileName, sha256(sceneData));
  });
}
