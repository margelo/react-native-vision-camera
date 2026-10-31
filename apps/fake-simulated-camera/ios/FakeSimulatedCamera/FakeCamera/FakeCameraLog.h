#import <Foundation/Foundation.h>
#import <os/log.h>

NS_ASSUME_NONNULL_BEGIN

os_log_t FakeCameraLog(void);

#define FAKECAM_INFO(fmt, ...) os_log(FakeCameraLog(), fmt, ##__VA_ARGS__)
#define FAKECAM_FAULT(fmt, ...) os_log_fault(FakeCameraLog(), fmt, ##__VA_ARGS__)

/// Fake objects are created without `init`, so any inherited AVFoundation selector we forgot to override would run
/// over zeroed private state. Selectors with no implementation anywhere land here instead and fail loudly.
#define FAKECAM_FORWARDING_NET                                                                            \
  -(NSMethodSignature *)methodSignatureForSelector : (SEL)selector {                                      \
    NSMethodSignature *signature = [super methodSignatureForSelector:selector];                           \
    return signature ?: [NSMethodSignature signatureWithObjCTypes:"@@:"];                                 \
  }                                                                                                       \
  -(void)forwardInvocation : (NSInvocation *)invocation {                                                 \
    FAKECAM_FAULT("%{public}@ does not implement %{public}@", NSStringFromClass([self class]),            \
                  NSStringFromSelector(invocation.selector));                                             \
    NSAssert(NO, @"FakeCamera: %@ does not implement %@", NSStringFromClass([self class]),                \
             NSStringFromSelector(invocation.selector));                                                  \
    id nothing = nil;                                                                                     \
    [invocation setReturnValue:&nothing];                                                                 \
  }

NS_ASSUME_NONNULL_END
