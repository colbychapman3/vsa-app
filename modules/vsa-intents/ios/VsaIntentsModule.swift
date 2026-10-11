import ExpoModulesCore
import Foundation

// Hands a count said to Siri to the app, once. The Siri command (plugins/ios/VsaLogCountIntent.swift, compiled into the
// app target by plugins/withLogIntent.js) stores it here; the app takes it when it comes to the foreground and opens the
// Log with it filled in. Nothing is saved until Colby taps Save. Taking it clears it, so it can never be applied twice.
public class VsaIntentsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VsaIntents")

    Function("takePending") { () -> [String: Double]? in
      let d = UserDefaults.standard
      guard let count = d.object(forKey: "vsa.pendingCount") as? Int else { return nil }
      let at = d.double(forKey: "vsa.pendingAt")
      d.removeObject(forKey: "vsa.pendingCount")
      d.removeObject(forKey: "vsa.pendingAt")
      return ["count": Double(count), "atMs": at * 1000]
    }
  }
}
