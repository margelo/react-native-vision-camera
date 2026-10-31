#import <Foundation/Foundation.h>
#import <objc/runtime.h>

NS_ASSUME_NONNULL_BEGIN

/// Replaces (or adds) an instance method and returns the previous implementation, which may be inherited or NULL.
IMP _Nullable FakeCameraReplaceInstanceMethod(Class cls, SEL selector, IMP replacement, const char *typesIfMissing);

/// Same for class methods.
IMP _Nullable FakeCameraReplaceClassMethod(Class cls, SEL selector, IMP replacement, const char *typesIfMissing);

NS_ASSUME_NONNULL_END
