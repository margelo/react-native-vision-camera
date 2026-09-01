#import "FakeCameraLog.h"

os_log_t FakeCameraLog(void) {
  static os_log_t log;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    log = os_log_create("com.margelo.fakecamera", "FakeCamera");
  });
  return log;
}
