#import "FakeCameraFramePump.h"

#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>
#import <UIKit/UIKit.h>
#import <objc/runtime.h>

#import "FakeCameraLog.h"
#import "FakeCameraObjects.h"
#import "FakeCameraSession.h"

static const void *kDisplayLayerKey = &kDisplayLayerKey;
static const double kMaxFramesPerSecond = 60.0;

@implementation FakeCameraFramePump {
  __weak AVCaptureSession *_session;
  dispatch_queue_t _queue;
  dispatch_source_t _timer;
  BOOL _stopped;
  double _framesPerSecond;
  CVPixelBufferRef _frame;
  CMVideoFormatDescriptionRef _frameDescription;
  int32_t _frameWidth;
  int32_t _frameHeight;
}

- (instancetype)initWithSession:(AVCaptureSession *)session {
  if ((self = [super init])) {
    _session = session;
    _queue = dispatch_queue_create("com.margelo.fakecamera.pump", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (void)dealloc {
  if (_timer) {
    dispatch_source_cancel(_timer);
    _timer = nil;
  }
  [self releaseFrame];
}

- (void)releaseFrame {
  if (_frame) {
    CVPixelBufferRelease(_frame);
    _frame = NULL;
  }
  if (_frameDescription) {
    CFRelease(_frameDescription);
    _frameDescription = NULL;
  }
}

- (void)start {
  dispatch_async(_queue, ^{
    self->_stopped = NO;
    [self armTimer];
  });
}

- (void)stop {
  dispatch_async(_queue, ^{
    self->_stopped = YES;
    if (self->_timer) {
      dispatch_source_cancel(self->_timer);
      self->_timer = nil;
    }
    self->_framesPerSecond = 0;
  });
}

- (FakeCameraDevice *)device {
  AVCaptureSession *session = _session;
  for (AVCaptureInput *input in FakeCameraSessionInputs(session)) {
    FakeCameraDevice *device = FakeCameraDeviceForInput(input);
    if (device != nil) {
      return device;
    }
  }
  return nil;
}

- (double)desiredFramesPerSecond {
  CMTime duration = self.device.activeVideoMinFrameDuration;
  double fps = CMTIME_IS_NUMERIC(duration) && CMTimeGetSeconds(duration) > 0 ? 1.0 / CMTimeGetSeconds(duration) : 30.0;
  // ponytail: 240 fps catalog formats stream at 60 to keep the Simulator responsive.
  return MIN(MAX(fps, 1.0), kMaxFramesPerSecond);
}

- (void)armTimer {
  if (_stopped) {
    return;
  }
  double fps = [self desiredFramesPerSecond];
  if (_timer && fps == _framesPerSecond) {
    return;
  }
  if (_timer) {
    dispatch_source_cancel(_timer);
  }
  _framesPerSecond = fps;
  _timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, _queue);
  uint64_t interval = (uint64_t)(NSEC_PER_SEC / fps);
  dispatch_source_set_timer(_timer, dispatch_time(DISPATCH_TIME_NOW, 0), interval, interval / 10);
  __weak FakeCameraFramePump *weakSelf = self;
  dispatch_source_set_event_handler(_timer, ^{
    [weakSelf tick];
  });
  dispatch_resume(_timer);
  FAKECAM_INFO("pump %p: streaming at %g fps", self, fps);
}

- (void)tick {
  if (_stopped) {
    return;
  }
  FakeCameraDevice *device = self.device;
  AVCaptureSession *session = _session;
  if (device == nil || session == nil) {
    return;
  }
  CMVideoDimensions dims = CMVideoFormatDescriptionGetDimensions(device.activeFormat.formatDescription);
  if (![self ensureFrameForWidth:dims.width height:dims.height]) {
    return;
  }
  CMSampleTimingInfo timing = {
      .duration = CMTimeMake(1, (int32_t)_framesPerSecond),
      .presentationTimeStamp = CMClockGetTime(CMClockGetHostTimeClock()),
      .decodeTimeStamp = kCMTimeInvalid,
  };
  CMSampleBufferRef sampleBuffer = NULL;
  OSStatus status = CMSampleBufferCreateReadyWithImageBuffer(kCFAllocatorDefault, _frame, _frameDescription, &timing, &sampleBuffer);
  if (status != noErr || sampleBuffer == NULL) {
    FAKECAM_FAULT("pump %p: CMSampleBufferCreateReadyWithImageBuffer failed (%d)", self, (int)status);
    return;
  }

  for (FakeCameraConnection *connection in FakeCameraSessionConnections(session)) {
    AVCaptureOutput *output = connection.output;
    if ([output isKindOfClass:[AVCaptureVideoDataOutput class]]) {
      [self deliverSampleBuffer:sampleBuffer toOutput:(AVCaptureVideoDataOutput *)output connection:connection];
    } else if (connection.videoPreviewLayer != nil) {
      [self displaySampleBuffer:sampleBuffer onLayer:connection.videoPreviewLayer];
    }
  }
  CFRelease(sampleBuffer);
  [self armTimer];
}

- (void)deliverSampleBuffer:(CMSampleBufferRef)sampleBuffer toOutput:(AVCaptureVideoDataOutput *)output connection:(AVCaptureConnection *)connection {
  id<AVCaptureVideoDataOutputSampleBufferDelegate> delegate = FakeCameraOutputDelegate(output);
  dispatch_queue_t queue = FakeCameraOutputQueue(output);
  if (delegate == nil || queue == nil || ![delegate respondsToSelector:@selector(captureOutput:didOutputSampleBuffer:fromConnection:)]) {
    return;
  }
  CFRetain(sampleBuffer);
  dispatch_async(queue, ^{
    [delegate captureOutput:output didOutputSampleBuffer:sampleBuffer fromConnection:connection];
    CFRelease(sampleBuffer);
  });
}

- (void)displaySampleBuffer:(CMSampleBufferRef)sampleBuffer onLayer:(AVCaptureVideoPreviewLayer *)layer {
  CFArrayRef attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, true);
  if (attachments && CFArrayGetCount(attachments) > 0) {
    CFDictionarySetValue((CFMutableDictionaryRef)CFArrayGetValueAtIndex(attachments, 0), kCMSampleAttachmentKey_DisplayImmediately, kCFBooleanTrue);
  }
  CFRetain(sampleBuffer);
  dispatch_async(dispatch_get_main_queue(), ^{
    AVSampleBufferDisplayLayer *display = objc_getAssociatedObject(layer, kDisplayLayerKey);
    if (display == nil) {
      display = [AVSampleBufferDisplayLayer new];
      display.videoGravity = AVLayerVideoGravityResizeAspectFill;
      objc_setAssociatedObject(layer, kDisplayLayerKey, display, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
      [layer addSublayer:display];
    }
    display.frame = layer.bounds;
    if (display.isReadyForMoreMediaData) {
      [display enqueueSampleBuffer:sampleBuffer];
    }
    CFRelease(sampleBuffer);
  });
}

// Renders the scene once per format size: white background, image aspect-fit in the centre.
- (BOOL)ensureFrameForWidth:(int32_t)width height:(int32_t)height {
  if (_frame != NULL && _frameWidth == width && _frameHeight == height) {
    return YES;
  }
  [self releaseFrame];
  NSDictionary *attributes = @{(id)kCVPixelBufferIOSurfacePropertiesKey : @{}};
  CVReturn result = CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, (__bridge CFDictionaryRef)attributes, &_frame);
  if (result != kCVReturnSuccess) {
    FAKECAM_FAULT("pump %p: CVPixelBufferCreate %dx%d failed (%d)", self, width, height, (int)result);
    return NO;
  }
  CVPixelBufferLockBaseAddress(_frame, 0);
  CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
  CGContextRef context = CGBitmapContextCreate(CVPixelBufferGetBaseAddress(_frame), width, height, 8, CVPixelBufferGetBytesPerRow(_frame), colorSpace,
                                               kCGImageAlphaPremultipliedFirst | kCGBitmapByteOrder32Little);
  CGContextSetFillColorWithColor(context, UIColor.whiteColor.CGColor);
  CGContextFillRect(context, CGRectMake(0, 0, width, height));
  CGImageRef scene = FakeCameraRegistry.shared.sceneImage;
  if (scene != NULL) {
    CGFloat side = MIN(width, height) * 0.7;
    CGFloat scale = MIN(side / CGImageGetWidth(scene), side / CGImageGetHeight(scene));
    CGFloat drawWidth = CGImageGetWidth(scene) * scale;
    CGFloat drawHeight = CGImageGetHeight(scene) * scale;
    CGContextDrawImage(context, CGRectMake((width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight), scene);
  }
  CGContextRelease(context);
  CGColorSpaceRelease(colorSpace);
  CVPixelBufferUnlockBaseAddress(_frame, 0);

  OSStatus status = CMVideoFormatDescriptionCreateForImageBuffer(kCFAllocatorDefault, _frame, &_frameDescription);
  if (status != noErr) {
    FAKECAM_FAULT("pump %p: CMVideoFormatDescriptionCreateForImageBuffer failed (%d)", self, (int)status);
    [self releaseFrame];
    return NO;
  }
  _frameWidth = width;
  _frameHeight = height;
  FAKECAM_INFO("pump %p: rendered scene at %dx%d", self, width, height);
  return YES;
}

@end
