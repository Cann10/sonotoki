import SwiftUI
import SwiftData
import SonotokiKit

@main
struct SonotokiApp: App {
    @State private var env = AppEnvironment()

    var body: some Scene {
        WindowGroup {
            RootContainer()
                .environment(env)
                .environment(env.store)
                .task { await env.start() }
                .tint(Palette.moment)
        }
        .modelContainer(env.container)
    }
}

/// Owns the container + services + store and wires the callbacks between them.
@MainActor
@Observable
final class AppEnvironment {
    let container: ModelContainer
    let notifier = NotificationService()
    let location = LocationService()
    let store: SonotokiStore

    init() {
        let container = SonotokiSchema.container()
        self.container = container
        self.store = SonotokiStore(
            context: container.mainContext,
            notifier: notifier,
            location: location
        )

        // Notification action buttons → store.
        notifier.onAction = { [store] momentID, action in
            switch action {
            case .done: store.markDone(momentID: momentID)
            case .next: store.markNext(momentID: momentID)
            }
        }
        notifier.onOpen = { [store] momentID in
            store.presentedFire = store.moments.first { $0.id == momentID }
        }
        // Core Location enter/exit → engine.
        location.onSituation = { [store] event in
            store.handleSituation(event)
        }
    }

    func start() async {
        notifier.configure()
        _ = await notifier.requestAuthorization()
        location.requestWhenInUseIfNeeded()
        store.bootstrapMonitoring()   // plan: rebuild monitoring after cold launch / restart
    }
}

/// Chooses onboarding vs. the main screen, and hosts the full-screen fire view.
struct RootContainer: View {
    @Environment(SonotokiStore.self) private var store

    var body: some View {
        Group {
            if store.didOnboard {
                RootView()
            } else {
                OnboardingView()
            }
        }
        .fullScreenCover(item: Binding(
            get: { store.presentedFire },
            set: { store.presentedFire = $0 }
        )) { moment in
            SonotokiMomentView(
                moment: moment,
                queueRemaining: 0,
                onDone: { store.markDone(momentID: moment.id) },
                onNext: { store.markNext(momentID: moment.id) }
            )
        }
    }
}
