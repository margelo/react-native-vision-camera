#import "FakeCameraSwizzle.h"

static IMP replaceMethod(Class cls, SEL selector, IMP replacement, const char *typesIfMissing) {
  Method existing = class_getInstanceMethod(cls, selector);
  const char *types = existing ? method_getTypeEncoding(existing) : typesIfMissing;
  // class_addMethod succeeds when `cls` itself has no implementation (inherited or missing): the previous IMP is then
  // the inherited one. Otherwise swap the implementation in place.
  if (class_addMethod(cls, selector, replacement, types)) {
    return existing ? method_getImplementation(existing) : NULL;
  }
  return method_setImplementation(class_getInstanceMethod(cls, selector), replacement);
}

IMP FakeCameraReplaceInstanceMethod(Class cls, SEL selector, IMP replacement, const char *typesIfMissing) {
  return replaceMethod(cls, selector, replacement, typesIfMissing);
}

IMP FakeCameraReplaceClassMethod(Class cls, SEL selector, IMP replacement, const char *typesIfMissing) {
  return replaceMethod(object_getClass(cls), selector, replacement, typesIfMissing);
}
