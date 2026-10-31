#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Hooks `AVCaptureDeviceInput`, `AVCaptureSession`, `AVCaptureConnection`, `AVCaptureOutput`,
/// `AVCaptureVideoDataOutput`, `AVCaptureVideoPreviewLayer` and `AVCapturePhotoOutput` so a session that received a
/// fake input keeps a fake graph. Sessions without a fake input keep their original implementations.
void FakeCameraInstallSessionHooks(void);

BOOL FakeCameraIsFakeSession(AVCaptureSession *_Nullable session);
NSArray<AVCaptureInput *> *FakeCameraSessionInputs(AVCaptureSession *session);
NSArray<AVCaptureOutput *> *FakeCameraSessionOutputs(AVCaptureSession *session);
NSArray<AVCaptureConnection *> *FakeCameraSessionConnections(AVCaptureSession *session);
NSDictionary *_Nullable FakeCameraOutputVideoSettings(AVCaptureVideoDataOutput *output);
id<AVCaptureVideoDataOutputSampleBufferDelegate> _Nullable FakeCameraOutputDelegate(AVCaptureVideoDataOutput *output);
dispatch_queue_t _Nullable FakeCameraOutputQueue(AVCaptureVideoDataOutput *output);

NS_ASSUME_NONNULL_END
