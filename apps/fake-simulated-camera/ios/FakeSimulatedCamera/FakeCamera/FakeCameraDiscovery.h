#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Hooks `AVCaptureDevice` / `AVCaptureDeviceDiscoverySession` class methods so video discovery returns the catalog.
/// Non-video media types (microphone) keep their original implementations.
void FakeCameraInstallDiscoveryHooks(void);

NS_ASSUME_NONNULL_END
