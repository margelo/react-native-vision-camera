#import "FakeCameraSession.h"

#import <objc/message.h>
#import <objc/runtime.h>

#import "FakeCameraFramePump.h"
#import "FakeCameraLog.h"
#import "FakeCameraObjects.h"
#import "FakeCameraSwizzle.h"

// Per-session state lives in associated objects so nothing leaks between sessions.
static const void *kSessionFakeKey = &kSessionFakeKey;
static const void *kSessionInputsKey = &kSessionInputsKey;
static const void *kSessionOutputsKey = &kSessionOutputsKey;
static const void *kSessionConnectionsKey = &kSessionConnectionsKey;
static const void *kSessionRunningKey = &kSessionRunningKey;
static const void *kSessionPumpKey = &kSessionPumpKey;
static const void *kSessionPresetKey = &kSessionPresetKey;
static const void *kOutputConnectionsKey = &kOutputConnectionsKey;
static const void *kOutputSessionKey = &kOutputSessionKey;
static const void *kOutputVideoSettingsKey = &kOutputVideoSettingsKey;
static const void *kOutputDelegateKey = &kOutputDelegateKey;
static const void *kOutputQueueKey = &kOutputQueueKey;
static const void *kLayerSessionKey = &kLayerSessionKey;
static const void *kPhotoOutputMaxDimensionsKey = &kPhotoOutputMaxDimensionsKey;

static NSLock *stateLock(void) {
  static NSLock *lock;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    lock = [NSLock new];
  });
  return lock;
}

static NSMutableArray *list(id owner, const void *key) {
  NSMutableArray *array = objc_getAssociatedObject(owner, key);
  if (array == nil) {
    array = [NSMutableArray array];
    objc_setAssociatedObject(owner, key, array, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }
  return array;
}

static void listAdd(id owner, const void *key, id object) {
  [stateLock() lock];
  NSMutableArray *array = list(owner, key);
  if (![array containsObject:object]) {
    [array addObject:object];
  }
  [stateLock() unlock];
}

static void listRemove(id owner, const void *key, id object) {
  [stateLock() lock];
  [list(owner, key) removeObject:object];
  [stateLock() unlock];
}

static NSArray *listCopy(id owner, const void *key) {
  [stateLock() lock];
  NSArray *copy = [list(owner, key) copy];
  [stateLock() unlock];
  return copy;
}

static NSArray *merged(NSArray *fake, NSArray *original) {
  if (original.count == 0) {
    return fake;
  }
  NSMutableArray *result = [fake mutableCopy];
  for (id object in original) {
    if (![result containsObject:object]) {
      [result addObject:object];
    }
  }
  return result;
}

BOOL FakeCameraIsFakeSession(AVCaptureSession *session) {
  return session != nil && [objc_getAssociatedObject(session, kSessionFakeKey) boolValue];
}

NSArray<AVCaptureInput *> *FakeCameraSessionInputs(AVCaptureSession *session) {
  return listCopy(session, kSessionInputsKey);
}

NSArray<AVCaptureOutput *> *FakeCameraSessionOutputs(AVCaptureSession *session) {
  return listCopy(session, kSessionOutputsKey);
}

NSArray<AVCaptureConnection *> *FakeCameraSessionConnections(AVCaptureSession *session) {
  return listCopy(session, kSessionConnectionsKey);
}

NSDictionary *FakeCameraOutputVideoSettings(AVCaptureVideoDataOutput *output) {
  return objc_getAssociatedObject(output, kOutputVideoSettingsKey);
}

id<AVCaptureVideoDataOutputSampleBufferDelegate> FakeCameraOutputDelegate(AVCaptureVideoDataOutput *output) {
  return objc_getAssociatedObject(output, kOutputDelegateKey);
}

dispatch_queue_t FakeCameraOutputQueue(AVCaptureVideoDataOutput *output) {
  return objc_getAssociatedObject(output, kOutputQueueKey);
}

static FakeCameraFramePump *pumpForSession(AVCaptureSession *session, BOOL create) {
  FakeCameraFramePump *pump = objc_getAssociatedObject(session, kSessionPumpKey);
  if (pump == nil && create) {
    pump = [[FakeCameraFramePump alloc] initWithSession:session];
    objc_setAssociatedObject(session, kSessionPumpKey, pump, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }
  return pump;
}

static void markSessionFake(AVCaptureSession *session) {
  if (!FakeCameraIsFakeSession(session)) {
    objc_setAssociatedObject(session, kSessionFakeKey, @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    FAKECAM_INFO("session %p is now fake", session);
  }
}

// MARK: - AVCaptureDeviceInput

static IMP originalInputInit;
static IMP originalInputDevice;
static IMP originalInputPorts;

static id inputInitWithDevice(id self, SEL _cmd, AVCaptureDevice *device, NSError **error) {
  if (!FakeCameraIsFakeDevice(device)) {
    return ((id(*)(id, SEL, AVCaptureDevice *, NSError **))originalInputInit)(self, _cmd, device, error);
  }
  // AVFoundation's designated initializer needs a real capture service; NSObject's init leaves the instance
  // zeroed and every accessor VisionCamera uses is routed to the tag below.
  struct objc_super superInfo = {self, [NSObject class]};
  id input = ((id(*)(struct objc_super *, SEL))objc_msgSendSuper)(&superInfo, @selector(init));
  FakeCameraTagInput(input, (FakeCameraDevice *)device);
  if (error) {
    *error = nil;
  }
  return input;
}

static AVCaptureDevice *inputDevice(id self, SEL _cmd) {
  FakeCameraDevice *device = FakeCameraDeviceForInput(self);
  return device ?: ((AVCaptureDevice * (*)(id, SEL)) originalInputDevice)(self, _cmd);
}

static NSArray *inputPorts(id self, SEL _cmd) {
  FakeCameraInputPort *port = FakeCameraPortForInput(self);
  return port ? @[ port ] : ((NSArray * (*)(id, SEL)) originalInputPorts)(self, _cmd);
}

// MARK: - AVCaptureSession

static IMP originalCanAddInput;
static IMP originalAddInput;
static IMP originalAddInputWithNoConnections;
static IMP originalRemoveInput;
static IMP originalCanAddOutput;
static IMP originalAddOutput;
static IMP originalAddOutputWithNoConnections;
static IMP originalRemoveOutput;
static IMP originalCanAddConnection;
static IMP originalAddConnection;
static IMP originalRemoveConnection;
static IMP originalInputs;
static IMP originalOutputs;
static IMP originalConnections;
static IMP originalStartRunning;
static IMP originalStopRunning;
static IMP originalIsRunning;
static IMP originalSessionPreset;
static IMP originalSetSessionPreset;
static IMP originalCanSetSessionPreset;

static void detachConnection(AVCaptureSession *session, FakeCameraConnection *connection) {
  listRemove(session, kSessionConnectionsKey, connection);
  AVCaptureOutput *output = connection.output;
  if (output != nil) {
    listRemove(output, kOutputConnectionsKey, connection);
  }
}

static BOOL sessionCanAddInput(id self, SEL _cmd, AVCaptureInput *input) {
  if (FakeCameraIsFakeInput(input)) {
    return YES;
  }
  return ((BOOL(*)(id, SEL, AVCaptureInput *))originalCanAddInput)(self, _cmd, input);
}

static void sessionAddInputCommon(AVCaptureSession *self, AVCaptureInput *input) {
  markSessionFake(self);
  listAdd(self, kSessionInputsKey, input);
  FAKECAM_INFO("session %p: added fake input for %{public}@", self, FakeCameraDeviceForInput(input).uniqueID);
}

static void sessionAddInput(id self, SEL _cmd, AVCaptureInput *input) {
  if (FakeCameraIsFakeInput(input)) {
    sessionAddInputCommon(self, input);
    return;
  }
  ((void (*)(id, SEL, AVCaptureInput *))originalAddInput)(self, _cmd, input);
}

static void sessionAddInputWithNoConnections(id self, SEL _cmd, AVCaptureInput *input) {
  if (FakeCameraIsFakeInput(input)) {
    sessionAddInputCommon(self, input);
    return;
  }
  ((void (*)(id, SEL, AVCaptureInput *))originalAddInputWithNoConnections)(self, _cmd, input);
}

static void sessionRemoveInput(id self, SEL _cmd, AVCaptureInput *input) {
  if (FakeCameraIsFakeInput(input)) {
    listRemove(self, kSessionInputsKey, input);
    for (FakeCameraConnection *connection in FakeCameraSessionConnections(self)) {
      if ([connection.inputPorts containsObject:FakeCameraPortForInput(input)]) {
        detachConnection(self, connection);
      }
    }
    FAKECAM_INFO("session %p: removed fake input for %{public}@", self, FakeCameraDeviceForInput(input).uniqueID);
    return;
  }
  ((void (*)(id, SEL, AVCaptureInput *))originalRemoveInput)(self, _cmd, input);
}

static BOOL sessionCanAddOutput(id self, SEL _cmd, AVCaptureOutput *output) {
  if (FakeCameraIsFakeSession(self)) {
    return YES;
  }
  return ((BOOL(*)(id, SEL, AVCaptureOutput *))originalCanAddOutput)(self, _cmd, output);
}

static void sessionAddOutputCommon(AVCaptureSession *self, AVCaptureOutput *output) {
  listAdd(self, kSessionOutputsKey, output);
  objc_setAssociatedObject(output, kOutputSessionKey, self, OBJC_ASSOCIATION_ASSIGN);
  FAKECAM_INFO("session %p: added output %{public}@", self, NSStringFromClass([output class]));
}

static void sessionAddOutput(id self, SEL _cmd, AVCaptureOutput *output) {
  if (FakeCameraIsFakeSession(self)) {
    sessionAddOutputCommon(self, output);
    return;
  }
  ((void (*)(id, SEL, AVCaptureOutput *))originalAddOutput)(self, _cmd, output);
}

static void sessionAddOutputWithNoConnections(id self, SEL _cmd, AVCaptureOutput *output) {
  if (FakeCameraIsFakeSession(self)) {
    sessionAddOutputCommon(self, output);
    return;
  }
  ((void (*)(id, SEL, AVCaptureOutput *))originalAddOutputWithNoConnections)(self, _cmd, output);
}

static void sessionRemoveOutput(id self, SEL _cmd, AVCaptureOutput *output) {
  if (FakeCameraIsFakeSession(self)) {
    listRemove(self, kSessionOutputsKey, output);
    for (FakeCameraConnection *connection in FakeCameraSessionConnections(self)) {
      if (connection.output == output) {
        detachConnection(self, connection);
      }
    }
    objc_setAssociatedObject(output, kOutputSessionKey, nil, OBJC_ASSOCIATION_ASSIGN);
    return;
  }
  ((void (*)(id, SEL, AVCaptureOutput *))originalRemoveOutput)(self, _cmd, output);
}

static BOOL sessionCanAddConnection(id self, SEL _cmd, AVCaptureConnection *connection) {
  if ([connection isKindOfClass:[FakeCameraConnection class]]) {
    return YES;
  }
  return ((BOOL(*)(id, SEL, AVCaptureConnection *))originalCanAddConnection)(self, _cmd, connection);
}

static void sessionAddConnection(id self, SEL _cmd, AVCaptureConnection *connection) {
  if ([connection isKindOfClass:[FakeCameraConnection class]]) {
    markSessionFake(self);
    listAdd(self, kSessionConnectionsKey, connection);
    AVCaptureOutput *output = connection.output;
    if (output != nil) {
      listAdd(output, kOutputConnectionsKey, connection);
    }
    FAKECAM_INFO("session %p: added connection %{public}@", self, connection);
    return;
  }
  ((void (*)(id, SEL, AVCaptureConnection *))originalAddConnection)(self, _cmd, connection);
}

static void sessionRemoveConnection(id self, SEL _cmd, AVCaptureConnection *connection) {
  if ([connection isKindOfClass:[FakeCameraConnection class]]) {
    detachConnection(self, (FakeCameraConnection *)connection);
    return;
  }
  ((void (*)(id, SEL, AVCaptureConnection *))originalRemoveConnection)(self, _cmd, connection);
}

static NSArray *sessionInputs(id self, SEL _cmd) {
  NSArray *original = ((NSArray * (*)(id, SEL)) originalInputs)(self, _cmd);
  return FakeCameraIsFakeSession(self) ? merged(FakeCameraSessionInputs(self), original) : original;
}

static NSArray *sessionOutputs(id self, SEL _cmd) {
  NSArray *original = ((NSArray * (*)(id, SEL)) originalOutputs)(self, _cmd);
  return FakeCameraIsFakeSession(self) ? merged(FakeCameraSessionOutputs(self), original) : original;
}

static NSArray *sessionConnections(id self, SEL _cmd) {
  NSArray *original = ((NSArray * (*)(id, SEL)) originalConnections)(self, _cmd);
  return FakeCameraIsFakeSession(self) ? merged(FakeCameraSessionConnections(self), original) : original;
}

static void postOnMain(AVCaptureSession *session, NSNotificationName name) {
  dispatch_async(dispatch_get_main_queue(), ^{
    [[NSNotificationCenter defaultCenter] postNotificationName:name object:session];
  });
}

static void sessionStartRunning(id self, SEL _cmd) {
  if (!FakeCameraIsFakeSession(self)) {
    ((void (*)(id, SEL))originalStartRunning)(self, _cmd);
    return;
  }
  if ([objc_getAssociatedObject(self, kSessionRunningKey) boolValue]) {
    return;
  }
  [self willChangeValueForKey:@"running"];
  objc_setAssociatedObject(self, kSessionRunningKey, @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  [self didChangeValueForKey:@"running"];
  [pumpForSession(self, YES) start];
  FAKECAM_INFO("session %p: startRunning", self);
  postOnMain(self, AVCaptureSessionDidStartRunningNotification);
}

static void sessionStopRunning(id self, SEL _cmd) {
  if (!FakeCameraIsFakeSession(self)) {
    ((void (*)(id, SEL))originalStopRunning)(self, _cmd);
    return;
  }
  if (![objc_getAssociatedObject(self, kSessionRunningKey) boolValue]) {
    return;
  }
  [pumpForSession(self, NO) stop];
  [self willChangeValueForKey:@"running"];
  objc_setAssociatedObject(self, kSessionRunningKey, @NO, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  [self didChangeValueForKey:@"running"];
  FAKECAM_INFO("session %p: stopRunning", self);
  postOnMain(self, AVCaptureSessionDidStopRunningNotification);
}

static BOOL sessionIsRunning(id self, SEL _cmd) {
  if (FakeCameraIsFakeSession(self)) {
    return [objc_getAssociatedObject(self, kSessionRunningKey) boolValue];
  }
  return ((BOOL(*)(id, SEL))originalIsRunning)(self, _cmd);
}

// Presets are stored for every session: the Simulator has no capture service, so the real setter rejects
// `inputPriority` before any input exists and VisionCamera sets it in `HybridCameraSession.init`.
static AVCaptureSessionPreset sessionPreset(id self, SEL _cmd) {
  return objc_getAssociatedObject(self, kSessionPresetKey) ?: AVCaptureSessionPresetHigh;
}

static void setSessionPreset(id self, SEL _cmd, AVCaptureSessionPreset preset) {
  objc_setAssociatedObject(self, kSessionPresetKey, preset, OBJC_ASSOCIATION_COPY_NONATOMIC);
}

static BOOL canSetSessionPreset(id self, SEL _cmd, AVCaptureSessionPreset preset) {
  return YES;
}

// MARK: - AVCaptureConnection

static IMP originalConnectionInitWithPorts;
static IMP originalConnectionInitWithPreviewLayer;

static BOOL containsFakePort(NSArray<AVCaptureInputPort *> *ports) {
  for (AVCaptureInputPort *port in ports) {
    if ([port isKindOfClass:[FakeCameraInputPort class]]) {
      return YES;
    }
  }
  return NO;
}

static id connectionInitWithPorts(id self, SEL _cmd, NSArray<AVCaptureInputPort *> *ports, AVCaptureOutput *output) {
  if (containsFakePort(ports)) {
    // The allocated-but-uninitialized `self` is dropped (kept alive by the registry: its real dealloc must not run).
    [FakeCameraRegistry.shared retainForever:self];
    return [FakeCameraConnection connectionWithInputPorts:ports output:output];
  }
  return ((id(*)(id, SEL, NSArray *, AVCaptureOutput *))originalConnectionInitWithPorts)(self, _cmd, ports, output);
}

static id connectionInitWithPreviewLayer(id self, SEL _cmd, AVCaptureInputPort *port, AVCaptureVideoPreviewLayer *layer) {
  if ([port isKindOfClass:[FakeCameraInputPort class]]) {
    [FakeCameraRegistry.shared retainForever:self];
    return [FakeCameraConnection connectionWithInputPort:port videoPreviewLayer:layer];
  }
  return ((id(*)(id, SEL, AVCaptureInputPort *, AVCaptureVideoPreviewLayer *))originalConnectionInitWithPreviewLayer)(self, _cmd, port, layer);
}

// MARK: - AVCaptureOutput

static IMP originalOutputConnections;
static IMP originalOutputConnectionWithMediaType;

static NSArray *outputConnections(id self, SEL _cmd) {
  NSArray *original = ((NSArray * (*)(id, SEL)) originalOutputConnections)(self, _cmd);
  return merged(listCopy(self, kOutputConnectionsKey), original);
}

static AVCaptureConnection *outputConnectionWithMediaType(id self, SEL _cmd, AVMediaType mediaType) {
  if ([mediaType isEqualToString:AVMediaTypeVideo]) {
    AVCaptureConnection *fake = listCopy(self, kOutputConnectionsKey).firstObject;
    if (fake != nil) {
      return fake;
    }
  }
  return ((AVCaptureConnection * (*)(id, SEL, AVMediaType)) originalOutputConnectionWithMediaType)(self, _cmd, mediaType);
}

// MARK: - AVCaptureVideoDataOutput

static IMP originalSetSampleBufferDelegate;
static IMP originalVideoSettings;

static void setSampleBufferDelegate(id self, SEL _cmd, id delegate, dispatch_queue_t queue) {
  objc_setAssociatedObject(self, kOutputDelegateKey, delegate, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(self, kOutputQueueKey, queue, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  ((void (*)(id, SEL, id, dispatch_queue_t))originalSetSampleBufferDelegate)(self, _cmd, delegate, queue);
}

// The Simulator has no video pixel formats, so the real setter rejects every value; VisionCamera sets the
// settings before the output is attached, hence they are stored for every video data output.
static void setVideoSettings(id self, SEL _cmd, NSDictionary *settings) {
  objc_setAssociatedObject(self, kOutputVideoSettingsKey, settings, OBJC_ASSOCIATION_COPY_NONATOMIC);
}

static NSDictionary *videoSettings(id self, SEL _cmd) {
  return objc_getAssociatedObject(self, kOutputVideoSettingsKey) ?: ((NSDictionary * (*)(id, SEL)) originalVideoSettings)(self, _cmd);
}

static NSArray *availableVideoCVPixelFormatTypes(id self, SEL _cmd) {
  return @[ @(kCVPixelFormatType_32BGRA), @(kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange), @(kCVPixelFormatType_420YpCbCr8BiPlanarFullRange) ];
}

// MARK: - AVCaptureVideoPreviewLayer

static IMP originalLayerSetSession;
static IMP originalLayerSetSessionWithNoConnection;
static IMP originalLayerSession;
static IMP originalLayerConnection;

static void layerAttach(AVCaptureVideoPreviewLayer *layer, AVCaptureSession *session, IMP original, SEL _cmd) {
  AVCaptureSession *previous = objc_getAssociatedObject(layer, kLayerSessionKey);
  if (session == nil && previous != nil) {
    objc_setAssociatedObject(layer, kLayerSessionKey, nil, OBJC_ASSOCIATION_ASSIGN);
    for (FakeCameraConnection *connection in FakeCameraSessionConnections(previous)) {
      if (connection.videoPreviewLayer == layer) {
        detachConnection(previous, connection);
      }
    }
    return;
  }
  if (FakeCameraIsFakeSession(session)) {
    objc_setAssociatedObject(layer, kLayerSessionKey, session, OBJC_ASSOCIATION_ASSIGN);
    return;
  }
  ((void (*)(id, SEL, AVCaptureSession *))original)(layer, _cmd, session);
}

static void layerSetSession(id self, SEL _cmd, AVCaptureSession *session) {
  layerAttach(self, session, originalLayerSetSession, _cmd);
}

static void layerSetSessionWithNoConnection(id self, SEL _cmd, AVCaptureSession *session) {
  layerAttach(self, session, originalLayerSetSessionWithNoConnection, _cmd);
}

static AVCaptureSession *layerSession(id self, SEL _cmd) {
  AVCaptureSession *session = objc_getAssociatedObject(self, kLayerSessionKey);
  return session ?: ((AVCaptureSession * (*)(id, SEL)) originalLayerSession)(self, _cmd);
}

static AVCaptureConnection *layerConnection(id self, SEL _cmd) {
  AVCaptureSession *session = objc_getAssociatedObject(self, kLayerSessionKey);
  if (session != nil) {
    for (FakeCameraConnection *connection in FakeCameraSessionConnections(session)) {
      if (connection.videoPreviewLayer == self) {
        return connection;
      }
    }
    return nil;
  }
  return ((AVCaptureConnection * (*)(id, SEL)) originalLayerConnection)(self, _cmd);
}

// MARK: - AVCapturePhotoOutput

static IMP originalMaxPhotoDimensions;
static IMP originalSetMaxPhotoDimensions;

static CMVideoDimensions maxPhotoDimensions(id self, SEL _cmd) {
  NSValue *stored = objc_getAssociatedObject(self, kPhotoOutputMaxDimensionsKey);
  if (stored != nil) {
    CMVideoDimensions dims;
    [stored getValue:&dims];
    return dims;
  }
  return ((CMVideoDimensions(*)(id, SEL))originalMaxPhotoDimensions)(self, _cmd);
}

static void setMaxPhotoDimensions(id self, SEL _cmd, CMVideoDimensions dims) {
  if (objc_getAssociatedObject(self, kOutputSessionKey) != nil) {
    objc_setAssociatedObject(self, kPhotoOutputMaxDimensionsKey, [NSValue valueWithBytes:&dims objCType:@encode(CMVideoDimensions)], OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    return;
  }
  ((void (*)(id, SEL, CMVideoDimensions))originalSetMaxPhotoDimensions)(self, _cmd, dims);
}

// MARK: - Installation

static void installSessionClass(Class cls) {
  originalCanAddInput = FakeCameraReplaceInstanceMethod(cls, @selector(canAddInput:), (IMP)sessionCanAddInput, "B@:@");
  originalAddInput = FakeCameraReplaceInstanceMethod(cls, @selector(addInput:), (IMP)sessionAddInput, "v@:@");
  originalAddInputWithNoConnections = FakeCameraReplaceInstanceMethod(cls, @selector(addInputWithNoConnections:), (IMP)sessionAddInputWithNoConnections, "v@:@");
  originalRemoveInput = FakeCameraReplaceInstanceMethod(cls, @selector(removeInput:), (IMP)sessionRemoveInput, "v@:@");
  originalCanAddOutput = FakeCameraReplaceInstanceMethod(cls, @selector(canAddOutput:), (IMP)sessionCanAddOutput, "B@:@");
  originalAddOutput = FakeCameraReplaceInstanceMethod(cls, @selector(addOutput:), (IMP)sessionAddOutput, "v@:@");
  originalAddOutputWithNoConnections = FakeCameraReplaceInstanceMethod(cls, @selector(addOutputWithNoConnections:), (IMP)sessionAddOutputWithNoConnections, "v@:@");
  originalRemoveOutput = FakeCameraReplaceInstanceMethod(cls, @selector(removeOutput:), (IMP)sessionRemoveOutput, "v@:@");
  originalCanAddConnection = FakeCameraReplaceInstanceMethod(cls, @selector(canAddConnection:), (IMP)sessionCanAddConnection, "B@:@");
  originalAddConnection = FakeCameraReplaceInstanceMethod(cls, @selector(addConnection:), (IMP)sessionAddConnection, "v@:@");
  originalRemoveConnection = FakeCameraReplaceInstanceMethod(cls, @selector(removeConnection:), (IMP)sessionRemoveConnection, "v@:@");
  originalInputs = FakeCameraReplaceInstanceMethod(cls, @selector(inputs), (IMP)sessionInputs, "@@:");
  originalOutputs = FakeCameraReplaceInstanceMethod(cls, @selector(outputs), (IMP)sessionOutputs, "@@:");
  originalConnections = FakeCameraReplaceInstanceMethod(cls, @selector(connections), (IMP)sessionConnections, "@@:");
  originalStartRunning = FakeCameraReplaceInstanceMethod(cls, @selector(startRunning), (IMP)sessionStartRunning, "v@:");
  originalStopRunning = FakeCameraReplaceInstanceMethod(cls, @selector(stopRunning), (IMP)sessionStopRunning, "v@:");
  originalIsRunning = FakeCameraReplaceInstanceMethod(cls, @selector(isRunning), (IMP)sessionIsRunning, "B@:");
  originalSessionPreset = FakeCameraReplaceInstanceMethod(cls, @selector(sessionPreset), (IMP)sessionPreset, "@@:");
  originalSetSessionPreset = FakeCameraReplaceInstanceMethod(cls, @selector(setSessionPreset:), (IMP)setSessionPreset, "v@:@");
  originalCanSetSessionPreset = FakeCameraReplaceInstanceMethod(cls, @selector(canSetSessionPreset:), (IMP)canSetSessionPreset, "B@:@");
}

void FakeCameraInstallSessionHooks(void) {
  Class input = [AVCaptureDeviceInput class];
  originalInputInit = FakeCameraReplaceInstanceMethod(input, @selector(initWithDevice:error:), (IMP)inputInitWithDevice, "@@:@^@");
  originalInputDevice = FakeCameraReplaceInstanceMethod(input, @selector(device), (IMP)inputDevice, "@@:");
  originalInputPorts = FakeCameraReplaceInstanceMethod(input, @selector(ports), (IMP)inputPorts, "@@:");

  installSessionClass([AVCaptureSession class]);

  Class connection = [AVCaptureConnection class];
  originalConnectionInitWithPorts = FakeCameraReplaceInstanceMethod(connection, @selector(initWithInputPorts:output:), (IMP)connectionInitWithPorts, "@@:@@");
  originalConnectionInitWithPreviewLayer = FakeCameraReplaceInstanceMethod(connection, @selector(initWithInputPort:videoPreviewLayer:), (IMP)connectionInitWithPreviewLayer, "@@:@@");

  Class output = [AVCaptureOutput class];
  originalOutputConnections = FakeCameraReplaceInstanceMethod(output, @selector(connections), (IMP)outputConnections, "@@:");
  originalOutputConnectionWithMediaType = FakeCameraReplaceInstanceMethod(output, @selector(connectionWithMediaType:), (IMP)outputConnectionWithMediaType, "@@:@");

  Class videoDataOutput = [AVCaptureVideoDataOutput class];
  originalSetSampleBufferDelegate = FakeCameraReplaceInstanceMethod(videoDataOutput, @selector(setSampleBufferDelegate:queue:), (IMP)setSampleBufferDelegate, "v@:@@");
  FakeCameraReplaceInstanceMethod(videoDataOutput, @selector(setVideoSettings:), (IMP)setVideoSettings, "v@:@");
  originalVideoSettings = FakeCameraReplaceInstanceMethod(videoDataOutput, @selector(videoSettings), (IMP)videoSettings, "@@:");
  FakeCameraReplaceInstanceMethod(videoDataOutput, @selector(availableVideoCVPixelFormatTypes), (IMP)availableVideoCVPixelFormatTypes, "@@:");

  Class layer = [AVCaptureVideoPreviewLayer class];
  originalLayerSetSession = FakeCameraReplaceInstanceMethod(layer, @selector(setSession:), (IMP)layerSetSession, "v@:@");
  originalLayerSetSessionWithNoConnection = FakeCameraReplaceInstanceMethod(layer, @selector(setSessionWithNoConnection:), (IMP)layerSetSessionWithNoConnection, "v@:@");
  originalLayerSession = FakeCameraReplaceInstanceMethod(layer, @selector(session), (IMP)layerSession, "@@:");
  originalLayerConnection = FakeCameraReplaceInstanceMethod(layer, @selector(connection), (IMP)layerConnection, "@@:");

  if (@available(iOS 16.0, *)) {
    Class photoOutput = [AVCapturePhotoOutput class];
    originalMaxPhotoDimensions = FakeCameraReplaceInstanceMethod(photoOutput, @selector(maxPhotoDimensions), (IMP)maxPhotoDimensions, "{CMVideoDimensions=ii}@:");
    originalSetMaxPhotoDimensions = FakeCameraReplaceInstanceMethod(photoOutput, @selector(setMaxPhotoDimensions:), (IMP)setMaxPhotoDimensions, "v@:{CMVideoDimensions=ii}");
  }
  FAKECAM_INFO("session hooks installed");
}
