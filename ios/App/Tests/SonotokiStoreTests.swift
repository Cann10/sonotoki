import XCTest
import SwiftData
@testable import Sonotoki
@testable import SonotokiKit

// Behaviour spec for the app-side reducer, mirroring web/src/store/useSonotoki.test.ts.
// Uncompiled until the Mac session — add this file to the Xcode UNIT TEST target
// (needs `@testable import Sonotoki`, so the app target must have Testability on for Debug).
//
// Uses an in-memory ModelContainer + spy doubles for the two side-effecting services,
// so the whole submit → arm → situation → fire → done/next path is exercised without
// Core Location or the notification centre.

@MainActor
final class SonotokiStoreTests: XCTestCase {

    // MARK: Spies

    final class NotifierSpy: NotificationScheduling {
        var fired: [String] = []
        var backstopsScheduled: [String] = []
        var backstopsCancelled: [String] = []
        func fire(moment: Moment) { fired.append(moment.id) }
        func scheduleBackstop(moment: Moment, bucket: TimeBucket) { backstopsScheduled.append(moment.id) }
        func cancelBackstop(momentID: String) { backstopsCancelled.append(momentID) }
    }

    final class LocationSpy: LocationMonitoring {
        var monitored: [String: [ResolvedCondition]] = [:]
        var stopped: [String] = []
        var stopAllCount = 0
        func monitor(momentID: String, conditions: [ResolvedCondition]) { monitored[momentID] = conditions }
        func stopMonitoring(momentID: String) { stopped.append(momentID); monitored[momentID] = nil }
        func stopAll() { stopAllCount += 1; monitored.removeAll() }
        func requestWhenInUseIfNeeded() {}
    }

    // MARK: Fixture

    private func makeStore() -> (SonotokiStore, NotifierSpy, LocationSpy, ModelContext) {
        let container = try! ModelContainer(
            for: Schema(SonotokiSchema.models),
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let ctx = container.mainContext
        // Seed 家/職場 anchors + a taught「スーパー」so store phrases resolve without a map pick.
        ctx.insert(AnchorRecord(anchor: .home, latitude: 35.0, longitude: 139.0))
        ctx.insert(AnchorRecord(anchor: .work, latitude: 35.5, longitude: 139.5))
        let sup = LearnedLabelRecord(key: "スーパー", displayName: "スーパー")
        sup.refs = [PlaceRefRecord(from: .at(35.01, 139.01, id: "s1"))]
        ctx.insert(sup)
        try! ctx.save()

        let notifier = NotifierSpy()
        let location = LocationSpy()
        let store = SonotokiStore(context: ctx, notifier: notifier, location: location)
        return (store, notifier, location, ctx)
    }

    private func enterToken(_ store: SonotokiStore, _ token: String) {
        store.handleSituation(.enter(token: token))
    }

    // MARK: - submit

    func test_submit_storePhrase_armsAndMonitors_noFireYet() {
        let (store, notifier, location, _) = makeStore()
        store.submit("牛乳なくなりそう")

        XCTAssertEqual(store.moments.count, 1)
        XCTAssertEqual(store.moments[0].state, .armed)
        XCTAssertEqual(store.moments[0].trigger, .placeEnter(.label("スーパー")))
        XCTAssertTrue(notifier.fired.isEmpty)
        XCTAssertFalse(location.monitored.isEmpty, "a place Moment must register CL conditions")
    }

    func test_submit_customUnlearnedPhrase_becomesNeedsPlace() {
        let (store, _, location, _) = makeStore()
        store.submit("ジムに着いたらプロテイン")

        XCTAssertEqual(store.moments.count, 1)
        XCTAssertEqual(store.moments[0].state, .needsPlace)
        XCTAssertEqual(store.lastInference?.teachPhrase, "ジム")
        XCTAssertTrue(location.monitored.isEmpty, "needs_place Moments are not monitored")
    }

    // MARK: - teach

    func test_teachPlace_flipsNeedsPlaceToArmed_andLearnsLabel() {
        let (store, _, location, _) = makeStore()
        store.submit("ジムに着いたらプロテイン")
        let id = store.moments[0].id

        store.teachPlace(momentID: id, phrase: "ジム", ref: .at(35.2, 139.2, id: "g1"))

        XCTAssertEqual(store.moments[0].state, .armed)
        XCTAssertEqual(store.moments[0].trigger, .placeEnter(.label("ジム")))
        XCTAssertTrue(store.moments[0].learnedPlace)
        XCTAssertNotNil(store.dictionary.label(forKey: "ジム"))
        XCTAssertNotNil(location.monitored[id])
    }

    // MARK: - situation → fire

    func test_situationEnter_firesMoment_andNotifiesOnce() {
        let (store, notifier, _, _) = makeStore()
        store.submit("牛乳なくなりそう")
        let id = store.moments[0].id

        enterToken(store, "label:スーパー:s1")

        XCTAssertEqual(store.moments[0].state, .fired)
        XCTAssertEqual(notifier.fired, [id])
    }

    func test_situationEnter_unrelatedToken_doesNotFire() {
        let (store, notifier, _, _) = makeStore()
        store.submit("牛乳なくなりそう")
        enterToken(store, "anchor:work")
        XCTAssertEqual(store.moments[0].state, .armed)
        XCTAssertTrue(notifier.fired.isEmpty)
    }

    // MARK: - [やった] / [次のそのとき]

    func test_markDone_setsDone_stopsMonitoring_cancelsBackstop() {
        let (store, _, location, _) = makeStore()
        store.submit("牛乳なくなりそう")
        let id = store.moments[0].id
        enterToken(store, "label:スーパー:s1")

        store.markDone(momentID: id)

        XCTAssertEqual(store.moments[0].state, .done)
        XCTAssertTrue(location.stopped.contains(id))
    }

    func test_markNext_insideContext_awaitsThenReArmsOnExit() {
        let (store, _, _, _) = makeStore()
        store.submit("牛乳なくなりそう")
        let id = store.moments[0].id
        enterToken(store, "label:スーパー:s1")

        store.markNext(momentID: id)
        XCTAssertEqual(store.moments[0].state, .awaitingNext)

        store.handleSituation(.exit(token: "label:スーパー:s1"))
        XCTAssertEqual(store.moments[0].state, .armed)
    }

    func test_markNext_isNotATimeSnooze_reFiresOnReturn() {
        let (store, notifier, _, _) = makeStore()
        store.submit("牛乳なくなりそう")
        let id = store.moments[0].id
        enterToken(store, "label:スーパー:s1")
        store.markNext(momentID: id)
        store.handleSituation(.exit(token: "label:スーパー:s1"))
        enterToken(store, "label:スーパー:s1")

        XCTAssertEqual(store.moments[0].state, .fired)
        XCTAssertEqual(notifier.fired, [id, id])
        XCTAssertEqual(store.moments[0].firedCount, 2)
    }

    // MARK: - remove

    func test_remove_dropsMomentAndStopsMonitoring() {
        let (store, _, location, _) = makeStore()
        store.submit("牛乳なくなりそう")
        let id = store.moments[0].id
        store.remove(momentID: id)
        XCTAssertTrue(store.moments.isEmpty)
        XCTAssertTrue(location.stopped.contains(id))
    }

    // MARK: - dictionary sync

    func test_forgetLabel_parksArmedMomentAsNeedsPlace() {
        let (store, _, _, _) = makeStore()
        store.submit("牛乳なくなりそう")
        XCTAssertEqual(store.moments[0].state, .armed)

        store.forgetLabel("スーパー")

        XCTAssertEqual(store.moments[0].state, .needsPlace)
    }

    func test_addRef_toEmptiedLabel_reArmsParkedMoment() {
        let (store, _, _, _) = makeStore()
        store.submit("牛乳なくなりそう")
        store.forgetLabel("スーパー")
        XCTAssertEqual(store.moments[0].state, .needsPlace)

        // Re-learn スーパー with a new place.
        store.teachPlace(momentID: store.moments[0].id, phrase: "スーパー",
                         ref: .at(35.02, 139.02, id: "s2"))
        XCTAssertEqual(store.moments[0].state, .armed)
    }

    // MARK: - persistence round-trip

    func test_persistence_momentSurvivesAFreshStore() {
        let container = try! ModelContainer(
            for: Schema(SonotokiSchema.models),
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let ctx = container.mainContext
        let sup = LearnedLabelRecord(key: "スーパー", displayName: "スーパー")
        sup.refs = [PlaceRefRecord(from: .at(35.01, 139.01, id: "s1"))]
        ctx.insert(sup)
        try! ctx.save()

        let s1 = SonotokiStore(context: ctx, notifier: NotifierSpy(), location: LocationSpy())
        s1.submit("牛乳なくなりそう")
        let id = s1.moments[0].id

        let s2 = SonotokiStore(context: ctx, notifier: NotifierSpy(), location: LocationSpy())
        XCTAssertEqual(s2.moments.map(\.id), [id])
        XCTAssertEqual(s2.dictionary.label(forKey: "スーパー")?.refs.count, 1)
    }
}
