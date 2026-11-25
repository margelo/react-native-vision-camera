import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  private func valueForLaunchArgument(_ name: String) -> String? {
    let args = ProcessInfo.processInfo.arguments
    guard let index = args.firstIndex(of: name), index + 1 < args.count else {
      return nil
    }
    return args[index + 1]
  }

  private func configureMetroFromLaunchContext() {
    let defaults = UserDefaults.standard
    let launchArgJsLocation = valueForLaunchArgument("-RCT_jsLocation")
    let launchArgPackagerScheme = valueForLaunchArgument("-RCT_packager_scheme")

    // React Native reads these UserDefaults when constructing the debug Metro URL.
    // This is only for Harness runs on AWS Device Farm, where the physical iOS
    // device needs a custom IPv6 Metro host passed through launch arguments from
    // apps/simple-camera/rn-harness.config.mjs.
    // Release builds still use the prebundled JS bundle in bundleURL(), so these
    // values do not affect release app startup.
    if let jsLocation = launchArgJsLocation {
      defaults.set(jsLocation, forKey: "RCT_jsLocation")
    }

    if let packagerScheme = launchArgPackagerScheme {
      defaults.set(packagerScheme, forKey: "RCT_packager_scheme")
    }
  }

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    configureMetroFromLaunchContext()

    #if DEBUG && targetEnvironment(simulator)
      // Inject the catalog-defined fake camera before VisionCamera touches AVFoundation.
      FakeCameraInstall()
    #endif

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "FakeSimulatedCamera",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
