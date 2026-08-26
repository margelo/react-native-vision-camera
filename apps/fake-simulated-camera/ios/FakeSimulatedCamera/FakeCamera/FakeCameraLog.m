#import "FakeCameraLog.h"

os_log_t FakeCameraLog(void) {
  static os_log_t log;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    log = os_log_create("com.margelo.fakecamera", "FakeCamera");
  });
  return log;
}

void FakeCameraFileLog(NSString *message) {
  static NSString *path;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    path = [NSTemporaryDirectory() stringByAppendingPathComponent:@"fakecam-trace.log"];
  });
  FILE *file = fopen(path.UTF8String, "a");
  if (file != NULL) {
    fputs([[message stringByAppendingString:@"\n"] UTF8String], file);
    fflush(file);
    fclose(file);
  }
}
