import Foundation
import UserNotifications
import SonotokiKit

// Local notifications: the moment a Moment fires, and the optional time backstop.
// No remote push, ever. Interruption level is Time-Sensitive and only used when a
// Moment has actually come true (plan §13 / risk #4).

enum MomentAction { case done, next }

protocol NotificationScheduling: AnyObject {
    /// Deliver the「そのとき」notification now (the engine already decided it fired).
    func fire(moment: Moment)
    /// "時間でも念のため" — a calendar fallback for Moments with a read deadline.
    func scheduleBackstop(moment: Moment, bucket: TimeBucket)
    func cancelBackstop(momentID: String)
}

@MainActor
final class NotificationService: NSObject, NotificationScheduling, UNUserNotificationCenterDelegate {

    static let categoryID = "SONOTOKI_MOMENT"
    static let doneAction = "SONOTOKI_DONE"
    static let nextAction = "SONOTOKI_NEXT"

    /// Wired by the app to `store.markDone` / `store.markNext`.
    var onAction: ((_ momentID: String, _ action: MomentAction) -> Void)?
    /// Wired by the app so tapping the notification body opens the fire screen.
    var onOpen: ((_ momentID: String) -> Void)?

    private let center = UNUserNotificationCenter.current()

    func configure() {
        let done = UNNotificationAction(identifier: Self.doneAction, title: "やった", options: [])
        let next = UNNotificationAction(identifier: Self.nextAction, title: "次のそのとき", options: [])
        let category = UNNotificationCategory(
            identifier: Self.categoryID,
            actions: [done, next],
            intentIdentifiers: [],
            options: []
        )
        center.setNotificationCategories([category])
        center.delegate = self
    }

    /// Ask for notification permission. This is the only permission allowed to
    /// block onboarding completion (plan §12).
    func requestAuthorization() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    // MARK: - Fire

    func fire(moment: Moment) {
        let content = UNMutableNotificationContent()
        content.title = moment.originalText
        content.body = "そのとき: \(moment.humanLabel)"
        content.interruptionLevel = .timeSensitive
        content.categoryIdentifier = Self.categoryID
        content.userInfo = ["momentID": moment.id]
        content.sound = .default

        // nil trigger → deliver immediately; the engine owns the timing decision.
        let request = UNNotificationRequest(
            identifier: "fire-\(moment.id)-\(Int(Date().timeIntervalSince1970))",
            content: content,
            trigger: nil
        )
        center.add(request)
    }

    // MARK: - Backstop

    func scheduleBackstop(moment: Moment, bucket: TimeBucket) {
        let content = UNMutableNotificationContent()
        content.title = moment.originalText
        content.body = "そのとき（時間でのお知らせ）: \(moment.humanLabel)"
        content.interruptionLevel = .active
        content.categoryIdentifier = Self.categoryID
        content.userInfo = ["momentID": moment.id, "backstop": true]

        var comps = DateComponents()
        switch bucket {
        case .thisEvening:    comps.hour = 19; comps.minute = 0
        case .tomorrowMorning: comps.hour = 8; comps.minute = 0
        }
        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        center.add(UNNotificationRequest(
            identifier: backstopID(moment.id), content: content, trigger: trigger
        ))
    }

    func cancelBackstop(momentID: String) {
        center.removePendingNotificationRequests(withIdentifiers: [backstopID(momentID)])
    }

    private func backstopID(_ momentID: String) -> String { "backstop-\(momentID)" }

    // MARK: - UNUserNotificationCenterDelegate

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let info = response.notification.request.content.userInfo
        guard let momentID = info["momentID"] as? String else { return }
        let action = response.actionIdentifier
        await MainActor.run {
            switch action {
            case Self.doneAction:
                onAction?(momentID, .done)
            case Self.nextAction:
                onAction?(momentID, .next)
            case UNNotificationDefaultActionIdentifier:
                onOpen?(momentID)
            default:
                break
            }
        }
    }
}
