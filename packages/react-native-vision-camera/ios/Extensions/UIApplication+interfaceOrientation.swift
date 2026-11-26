//
//  UIApplication+interfaceOrientation.swift
//  VisionCamera
//
//  Created by Marc Rousavy on 02.07.24.
//

import Foundation
import UIKit

extension UIApplication {
  private var windowScene: UIWindowScene? {
    // Get all active scenes
    let activeScenes = connectedScenes.filter { $0.activationState == .foregroundActive }
    // Get the UIWindowScene
    let windowScene = activeScenes.first(where: { $0 is UIWindowScene })
    guard let windowScene = windowScene as? UIWindowScene else { return nil }
    return windowScene
  }

  /**
   Get the interface orientation of the main window scene in the application.
   */
  var interfaceOrientation: UIInterfaceOrientation {
    guard let windowScene = windowScene else {
      return .unknown
    }
    return windowScene.interfaceOrientation
  }

  /**
   Get the layer of the key window in the main window scene in the application.
   */
  var interfaceWindowLayer: CALayer? {
    return windowScene?.keyWindow?.layer
  }
}
