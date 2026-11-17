///
/// VisionCamera.swift
/// VisionCamera
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import AVFoundation
import Foundation
import NitroModules

final class VisionCamera: HybridCameraFactorySpec {
  var cameraPermissionStatus: PermissionStatus {
    let status = AVCaptureDevice.authorizationStatus(for: .video)
    return PermissionStatus(avStatus: status)
  }

  var microphonePermissionStatus: PermissionStatus {
    let status = AVCaptureDevice.authorizationStatus(for: .audio)
    return PermissionStatus(avStatus: status)
  }

  func requestCameraPermission() -> Promise<Bool> {
    return Promise.async {
      guard Bundle.main.infoDictionary?["NSCameraUsageDescription"] != nil else {
        throw RuntimeError.error(
          withMessage:
            "Cannot request Camera Permission - Your Info.plist does not contain a `NSCameraUsageDescription` key!"
        )
      }
      return await AVCaptureDevice.requestAccess(for: .video)
    }
  }

  func requestMicrophonePermission() -> Promise<Bool> {
    return Promise.async {
      guard Bundle.main.infoDictionary?["NSMicrophoneUsageDescription"] != nil else {
        throw RuntimeError.error(
          withMessage:
            "Cannot request Microphone Permission - Your Info.plist does not contain a `NSMicrophoneUsageDescription` key!"
        )
      }
      return await AVCaptureDevice.requestAccess(for: .audio)
    }
  }

  var supportsMultiCamSessions: Bool {
    return AVCaptureMultiCamSession.isMultiCamSupported
  }

  func createCameraSession(enableMultiCam: Bool) -> Promise<any HybridCameraSessionSpec> {
    return Promise.async {
      if enableMultiCam {
        guard self.supportsMultiCamSessions else {
          throw RuntimeError.error(
            withMessage:
              "Failed to create CameraSession - this device does not support multi-cam session! (See .supportsMultiCamSession)"
          )
        }
      }
      return HybridCameraSession(enableMultiCam: enableMultiCam)
    }
  }

  func createDeviceFactory() -> Promise<any HybridCameraDeviceFactorySpec> {
    return Promise.async {
      return HybridCameraDeviceFactory()
    }
  }

  func createPhotoOutput(options: PhotoOutputOptions) throws -> any HybridCameraPhotoOutputSpec {
    return try HybridCameraPhotoOutput(options: options)
  }

  func createVideoOutput(options: VideoOutputOptions) -> any HybridCameraVideoOutputSpec {
    if options.enablePersistentRecorder == true {
      // On iOS, the `AVCaptureMovieFileOutput` does not allow flipping the Camera while
      // recording, which is a feature we call "enablePersistentRecorder".
      // So if the user plans on using persistent recordings, we need to create a custom
      // video output that uses `AVCaptureVideoDataOutput` + `AVAssetWriter` instead.
      return HybridCameraVideoFrameOutput(options: options)
    } else {
      return HybridCameraVideoOutput(options: options)
    }
  }

  func createFrameOutput(options: FrameOutputOptions) -> any HybridCameraFrameOutputSpec {
    return HybridCameraFrameOutput(options: options)
  }

  func createDepthFrameOutput(options: DepthFrameOutputOptions)
    -> any HybridCameraDepthFrameOutputSpec
  {
    return HybridCameraDepthFrameOutput(options: options)
  }

  func createObjectOutput(options: ObjectOutputOptions) -> any HybridCameraObjectOutputSpec {
    return HybridCameraObjectOutput(options: options)
  }

  func createPreviewOutput(options: PreviewOutputOptions) -> any HybridCameraPreviewOutputSpec {
    return HybridCameraPreviewOutput(options: options)
  }

  func createOutputSynchronizer(outputs: [any HybridCameraOutputSpec]) throws
    -> any HybridCameraOutputSynchronizerSpec
  {
    return try HybridCameraOutputSynchronizer(outputs: outputs)
  }

  func createZoomGestureController() -> any HybridZoomGestureControllerSpec {
    return HybridZoomGestureController()
  }

  func createTapToFocusGestureController() -> any HybridTapToFocusGestureControllerSpec {
    return HybridTapToFocusGestureController()
  }

  func createOrientationManager(orientationSource: OrientationSource)
    -> any HybridOrientationManagerSpec
  {
    switch orientationSource {
    case .interface:
      return HybridInterfaceOrientationManager()
    case .device:
      return HybridDeviceOrientationManager()
    }
  }

  func createFrameRenderer() -> any HybridFrameRendererSpec {
    return HybridFrameRenderer()
  }

  func createNormalizedMeteringPoint(x: Double, y: Double, size: Double?)
    -> any HybridMeteringPointSpec
  {
    return HybridMeteringPoint(normalizedX: x, normalizedY: y, normalizedSize: size ?? 0.1)
  }

  func resolveConstraints(
    device: any HybridCameraDeviceSpec,
    outputConfigurations: [CameraOutputConfiguration],
    constraints: [Constraint],
    requiresMultiCam: Bool?
  ) -> Promise<any HybridCameraSessionConfigSpec> {
    return Promise.parallel {
      let outputs = outputConfigurations.map { $0.output }
      let resolvedConstraints = try ConstraintResolver.resolveConstraints(
        for: device,
        constraints: constraints,
        outputs: outputs,
        isMultiCam: requiresMultiCam == true)
      return HybridCameraSessionConfig(
        negotiatedFormat: resolvedConstraints.negotiatedFormat,
        enabledConstraints: resolvedConstraints.enabledConstraints)
    }
  }
}
