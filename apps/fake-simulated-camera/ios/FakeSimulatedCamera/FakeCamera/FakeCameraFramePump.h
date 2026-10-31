#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Streams the catalog scene image into every `AVCaptureVideoDataOutput` and preview layer connected to one fake
/// session, at the frame rate VisionCamera configured on the device. BGRA only.
@interface FakeCameraFramePump : NSObject
- (instancetype)initWithSession:(AVCaptureSession *)session;
- (void)start;
- (void)stop;
@end

NS_ASSUME_NONNULL_END
