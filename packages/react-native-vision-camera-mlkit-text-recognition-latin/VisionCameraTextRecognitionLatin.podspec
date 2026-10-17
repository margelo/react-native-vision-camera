require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "VisionCameraTextRecognitionLatin"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]
  s.platforms    = { :ios => 15.5, :visionos => 1.0 }
  s.source       = { :git => "https://github.com/margelo/react-native-vision-camera.git", :tag => "#{s.version}" }
  s.source_files = ["ios/**/*.{swift}", "ios/**/*.{m,mm}", "cpp/**/*.{hpp,cpp}"]
  s.frameworks = ["AVFoundation"]

  load 'nitrogen/generated/ios/VisionCameraTextRecognitionLatin+autolinking.rb'
  add_nitrogen_files(s)

  s.dependency 'GoogleMLKit/TextRecognition', '9.0.0'
  s.dependency 'VisionCamera'
  s.dependency 'NitroImage'
  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  install_modules_dependencies(s)
end
