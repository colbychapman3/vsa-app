import AppIntents
import Foundation

// "Hey Siri, log a count in VSA" → "How many autos this hour?" → "252". Siri opens VSA, and the Log opens on the hour
// that's due with 252 filled in. Nothing is saved until Save is tapped (the count is checked like any typed count).
// Also shows up in the Shortcuts app, so it can sit on the Action Button. Copied into the app target by
// plugins/withLogIntent.js: App Intents are found at build time only in the app target.
@available(iOS 16.0, *)
struct LogHourlyCountIntent: AppIntent {
  static var title: LocalizedStringResource = "Log hourly count"
  static var description = IntentDescription("Opens VSA with this hour's field count filled in. Nothing is saved until you tap Save.")
  static var openAppWhenRun: Bool = true

  @Parameter(title: "Autos", requestValueDialog: "How many autos this hour?")
  var count: Int

  @MainActor
  func perform() async throws -> some IntentResult {
    UserDefaults.standard.set(count, forKey: "vsa.pendingCount")
    UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "vsa.pendingAt")
    return .result()
  }
}

@available(iOS 16.0, *)
struct VsaAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: LogHourlyCountIntent(),
      phrases: [
        "Log a count in \(.applicationName)",
        "Log the hour in \(.applicationName)",
        "\(.applicationName) log count",
      ],
      shortTitle: "Log count",
      systemImageName: "plus.circle"
    )
  }
}
