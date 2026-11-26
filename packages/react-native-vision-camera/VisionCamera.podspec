require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "VisionCamera"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported, :visionos => 1.0 }
  s.source       = { :git => "https://github.com/margelo/react-native-vision-camera.git", :tag => "#{s.version}" }

  s.source_files = [
    # Implementation (Swift)
    "ios/**/*.{swift}",
    # Autolinking/Registration (Objective-C++)
    "ios/**/*.{m,mm}",
    # Implementation (C++ objects)
    "cpp/**/*.{hpp,cpp}",
  ]
  s.frameworks = ["AVFoundation"]

  # Frame interceptors (ios/Public/FrameInterceptors.swift) are compiled in only for the configurations
  # the app lists in its package.json under "visionCamera.frameInterceptors.ios" (default: Debug).
  app_package_json = File.join(Pod::Config.instance.installation_root.to_s, "..", "package.json")
  app_package = File.exist?(app_package_json) ? JSON.parse(File.read(app_package_json)) : {}
  frame_interceptor_configurations = app_package.dig("visionCamera", "frameInterceptors", "ios") || ["Debug"]
  s.pod_target_xcconfig = frame_interceptor_configurations.to_h do |configuration|
    ["SWIFT_ACTIVE_COMPILATION_CONDITIONS[config=#{configuration}]", "$(inherited) VISION_CAMERA_FRAME_INTERCEPTORS"]
  end

  load 'nitrogen/generated/ios/VisionCamera+autolinking.rb'
  add_nitrogen_files(s)

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  s.dependency 'NitroImage'
  install_modules_dependencies(s)
end
