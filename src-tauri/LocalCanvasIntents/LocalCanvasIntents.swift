import AppIntents
import AppKit
import Foundation

/// Creates the drawing in LocalCanvas itself so the extension never owns or
/// modifies library state.
struct NewQuickCanvasIntent: AppIntent {
    static let title: LocalizedStringResource = "New Quick Canvas"
    static let description = IntentDescription("Create and open a new quick canvas in LocalCanvas.")
    static let supportedModes: IntentModes = .foreground(.immediate)

    func perform() async throws -> some IntentResult {
        guard let url = URL(string: "localcanvas://quick-capture") else {
            return .result()
        }
        NSWorkspace.shared.open(url)
        return .result()
    }
}

struct LocalCanvasShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: NewQuickCanvasIntent(),
            phrases: [
                "New quick canvas in \(.applicationName)",
                "Capture in \(.applicationName)",
            ],
            shortTitle: "New Quick Canvas",
            systemImageName: "square.and.pencil"
        )
    }
}

@main
struct LocalCanvasIntentsExtension: AppIntentsExtension {}
