#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Installs the catalog-defined fake camera into AVFoundation. Simulator-only; call before React Native starts.
FOUNDATION_EXPORT void FakeCameraInstall(void);

NS_ASSUME_NONNULL_END
