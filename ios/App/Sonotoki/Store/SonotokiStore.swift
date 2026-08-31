import Foundation
import CoreLocation
import SwiftData
import Observation
import SonotokiKit

// The app's single source of truth. Mirrors web/src/store/useSonotoki.ts, minus the
// browser-only bits (situation simulator, localStorage, reset). Native differences:
//   - situation events come from LocationService / notification handlers, not a sim
//   - persistence is SwiftData (Persistence.swift), not localStorage
//   - arming a place trigger also (re)configures Core Location monitoring
//
// Flow per the approved plan:  Interpret (adapter) → Resolve (deterministic) →
// Arm (3 primitives) → Fire (Time-Sensitive notification) → [やった] / [次のそのとき].
// The AI only produces meaning; every place/timing/state decision is deterministic.

@MainActor
@Observable
final class SonotokiStore {

    // MARK: Observable state (drives SwiftUI)

    private(set) var moments: [Moment] = []
    private(set) var dictionary = PlaceDictionary()
    private(set) var world = WorldSnapshot()
    private(set) var didOnboard = false

    /// The inline confirmation shown right after `submit` (like web's InferenceToast).
    var lastInference: PendingInference?

    /// Non-nil while a fired Moment is showing full-screen (the「そのときです。」view).
    var presentedFire: Moment?

    // MARK: Collaborators

    private let context: ModelContext
    private let interpreter: Interpreter
    private let notifier: NotificationScheduling
    private let location: LocationMonitoring

    init(
        context: ModelContext,
        interpreter: Interpreter = RuleBasedInterpreter(),
        notifier: NotificationScheduling,
        location: LocationMonitoring
    ) {
        self.context = context
        self.interpreter = interpreter
        self.notifier = notifier
        self.location = location
        load()
    }

    // MARK: - Load / persist

    private func load() {
        let labelRecords = (try? context.fetch(FetchDescriptor<LearnedLabelRecord>())) ?? []
        var labels: [String: LearnedLabel] = [:]
        for rec in labelRecords { labels[rec.key] = rec.toValue() }
        dictionary = PlaceDictionary(labels: labels)

        let momentRecords = (try? context.fetch(
            FetchDescriptor<MomentRecord>(sortBy: [SortDescriptor(\.createdAt)])
        )) ?? []
        moments = momentRecords.compactMap { $0.toValue() }

        let appState = appStateRecord()
        world = appState.worldSnapshot
        didOnboard = appState.didOnboard
    }

    private func appStateRecord() -> AppStateRecord {
        if let existing = try? context.fetch(FetchDescriptor<AppStateRecord>()).first {
            return existing
        }
        let fresh = AppStateRecord()
        context.insert(fresh)
        return fresh
    }

    private func persistMoments(_ updated: [Moment]) {
        let byID = Dictionary(uniqueKeysWithValues: existingMomentRecords().map { ($0.id, $0) })
        for m in updated {
            if let rec = byID[m.id] { rec.apply(m) }
            else { context.insert(MomentRecord(from: m)) }
        }
        let keep = Set(updated.map(\.id))
        for rec in byID.values where !keep.contains(rec.id) { context.delete(rec) }
        moments = updated
        save()
    }

    private func existingMomentRecords() -> [MomentRecord] {
        (try? context.fetch(FetchDescriptor<MomentRecord>())) ?? []
    }

    private func persistDictionary() {
        // Rebuild label/ref records from the value type (small data set; simplest correct path).
        for rec in (try? context.fetch(FetchDescriptor<LearnedLabelRecord>())) ?? [] {
            context.delete(rec)
        }
        for label in dictionary.allLabels {
            let rec = LearnedLabelRecord(key: label.key, displayName: label.displayName, createdAt: label.createdAt)
            rec.refs = label.refs.map { PlaceRefRecord(from: $0) }
            context.insert(rec)
        }
        save()
    }

    private func persistWorld() {
        let rec = appStateRecord()
        rec.worldSnapshot = world
        save()
    }

    private func logEvent(_ momentID: String, _ type: String, note: String? = nil) {
        context.insert(EventRecord(momentID: momentID, type: type, note: note))
    }

    private func save() {
        do { try context.save() } catch { assertionFailure("SwiftData save failed: \(error)") }
    }

    // MARK: - submit（自然文 → Moment）

    struct PendingInference: Identifiable {
        let id = UUID()
        var interpretation: MomentInterpretation
        var momentID: String
        var needsConfirm: Bool
        /// Set when the chosen candidate is a custom phrase with no place yet.
        var teachPhrase: String? = nil
        var learnedNote: (phrase: String, target: PlaceTarget)? = nil
    }

    func submit(_ rawText: String) {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        let interpretation = interpreter.interpret(text, dictionary: dictionary)
        guard let top = interpretation.moments.first else { return }

        let id = UUID().uuidString

        switch resolve(top, dictionary: dictionary) {
        case .ok:
            guard let moment = TriggerEngine.armMoment(
                interpretation: interpretation,
                candidate: top,
                dictionary: dictionary,
                id: id
            ) else { return }
            var next = moments
            next.append(moment)
            persistMoments(next)
            logEvent(id, "armed")
            armMonitoringAndBackstop(for: moment)
            lastInference = PendingInference(
                interpretation: interpretation,
                momentID: id,
                needsConfirm: interpretation.needsUserConfirmation || moment.lowConfidence,
                learnedNote: top.learnedTarget.map { (top.placePhrase ?? top.placeLabel ?? "", $0) }
            )

        case .needsLearning(let phrase):
            let moment = TriggerEngine.buildLearningMoment(
                interpretation: interpretation, candidate: top, id: id
            )
            var next = moments
            next.append(moment)
            persistMoments(next)
            logEvent(id, "needs_place", note: phrase)
            lastInference = PendingInference(
                interpretation: interpretation, momentID: id,
                needsConfirm: true, teachPhrase: phrase
            )

        case .failed:
            return
        }
    }

    /// Pick a different candidate for a Moment that was just (or earlier) armed.
    func repick(momentID: String, candidateIndex: Int) {
        guard let current = moments.first(where: { $0.id == momentID }) else { return }
        let interpretation = interpreter.interpret(current.originalText, dictionary: dictionary)
        guard interpretation.moments.indices.contains(candidateIndex) else { return }
        let candidate = interpretation.moments[candidateIndex]

        switch resolve(candidate, dictionary: dictionary) {
        case .ok:
            guard let rearmed = TriggerEngine.armMoment(
                interpretation: interpretation, candidate: candidate,
                dictionary: dictionary, id: momentID
            ) else { return }
            replace(rearmed)
            armMonitoringAndBackstop(for: rearmed)
        case .needsLearning:
            replace(TriggerEngine.buildLearningMoment(
                interpretation: interpretation, candidate: candidate, id: momentID
            ))
        case .failed:
            break
        }
    }

    // MARK: - Personal Place Dictionary

    /// Answer "「ジム」ってどこ?" — bind a needs_place Moment to a concrete place.
    /// `ref` comes from the teach UI (map tap, nearby-POI pick, or "use current location").
    func teachPlace(momentID: String, phrase: String, ref: PlaceRef) {
        dictionary.learn(phrase: phrase, ref: ref)
        persistDictionary()
        syncMomentsToDictionary()

        if let m = moments.first(where: { $0.id == momentID }), m.state == .needsPlace {
            let key = placeKey(phrase)
            let resolved = TriggerEngine.resolveLearnedMoment(m, target: .label(key))
            replace(resolved)
            logEvent(momentID, "armed", note: "taught \(phrase)")
            armMonitoringAndBackstop(for: resolved)
        }
    }

    func addRef(labelKey: String, ref: PlaceRef) {
        dictionary.addRef(labelKey: labelKey, ref: ref)
        persistDictionary()
        syncMomentsToDictionary()
        rearmAllMonitoring()
    }

    func removeRef(labelKey: String, refID: String) {
        dictionary.removeRef(labelKey: labelKey, refID: refID)
        persistDictionary()
        syncMomentsToDictionary()
        rearmAllMonitoring()
    }

    func forgetLabel(_ key: String) {
        guard let label = dictionary.label(forKey: key) else { return }
        dictionary.forget(phrase: label.displayName)
        persistDictionary()
        syncMomentsToDictionary()
        rearmAllMonitoring()
    }

    /// If a label lost all its places, park armed Moments as needs_place; if a
    /// label gained its first place, re-arm parked ones. Mirrors web syncMomentsToDict.
    private func syncMomentsToDictionary() {
        let updated = moments.map { m -> Moment in
            guard case .label(let key) = labelTarget(of: m.trigger) else { return m }
            let hasPlace = dictionary.label(forKey: key)?.refs.isEmpty == false
            if !hasPlace, m.state == .armed || m.state == .awaitingNext {
                var mm = m; mm.state = .needsPlace; return mm
            }
            if hasPlace, m.state == .needsPlace {
                return TriggerEngine.resolveLearnedMoment(m, target: .label(key))
            }
            return m
        }
        persistMoments(updated)
    }

    private func labelTarget(of trigger: Trigger) -> PlaceTarget? {
        switch trigger {
        case .placeEnter(let t), .placeExit(let t): return t
        case .time: return nil
        }
    }

    // MARK: - Moment actions

    func remove(momentID: String) {
        persistMoments(moments.filter { $0.id != momentID })
        location.stopMonitoring(momentID: momentID)
        notifier.cancelBackstop(momentID: momentID)
    }

    func markDone(momentID: String) {
        replaceAll(TriggerEngine.markDone(moments, id: momentID))
        logEvent(momentID, "done")
        location.stopMonitoring(momentID: momentID)
        notifier.cancelBackstop(momentID: momentID)
        if presentedFire?.id == momentID { presentedFire = nil }
    }

    /// [次のそのとき] — not a time snooze. Re-fires next time the same situation holds.
    func markNext(momentID: String) {
        replaceAll(TriggerEngine.markNext(moments, world: world, id: momentID))
        logEvent(momentID, "next")
        if let m = moments.first(where: { $0.id == momentID }) {
            // If already re-armed (we were outside the context), monitoring must be live again.
            if m.state == .armed { armMonitoringAndBackstop(for: m) }
        }
        if presentedFire?.id == momentID { presentedFire = nil }
    }

    // MARK: - Situation events (from LocationService / time)

    /// Called when Core Location reports an enter/exit, or a time bucket rolls over.
    func handleSituation(_ event: SituationEvent, now: Date = .now) {
        let result = TriggerEngine.applySituation(
            moments: moments, world: world, event: event, now: now
        )
        world = result.world
        persistWorld()
        persistMoments(result.moments)

        for id in result.firedIDs {
            guard let m = result.moments.first(where: { $0.id == id }) else { continue }
            logEvent(id, "fired")
            notifier.fire(moment: m)               // Time-Sensitive notification
            notifier.cancelBackstop(momentID: id)  // real fire beats the backstop
        }
        // Newly re-armed Moments (awaitingNext → armed) need monitoring restored.
        for m in result.moments where m.state == .armed {
            armMonitoringAndBackstop(for: m)
        }
    }

    // MARK: - Arming helpers

    /// Register Core Location conditions for a place Moment (expanded to per-ref
    /// region tokens with real coordinates) and, if warranted, a time backstop.
    private func armMonitoringAndBackstop(for moment: Moment) {
        if !moment.trigger.isTime {
            location.monitor(momentID: moment.id, conditions: resolvedConditions(for: moment))
        }
        if let bucket = moment.timeBackstop {
            notifier.scheduleBackstop(moment: moment, bucket: bucket)
        }
    }

    /// semantic Trigger → per-ref region tokens → concrete geofences (centre + radius).
    /// `label:` coordinates come from the dictionary; `anchor:` from AnchorRecord.
    private func resolvedConditions(for moment: Moment) -> [ResolvedCondition] {
        expandTriggers(moment.trigger, dictionary: dictionary).compactMap { t in
            let target: PlaceTarget
            let edge: ResolvedCondition.Edge
            switch t {
            case .placeEnter(let tgt): target = tgt; edge = .enter
            case .placeExit(let tgt):  target = tgt; edge = .exit
            case .time:                return nil
            }
            guard case .region(let token) = target,
                  let (center, radius) = coordinate(forToken: token)
            else { return nil }
            return ResolvedCondition(token: token, center: center, radius: radius, edge: edge)
        }
    }

    private func coordinate(forToken token: String) -> (CLLocationCoordinate2D, CLLocationDistance)? {
        if token.hasPrefix("anchor:") {
            let raw = String(token.dropFirst("anchor:".count))
            guard let rec = try? context.fetch(
                FetchDescriptor<AnchorRecord>(predicate: #Predicate { $0.anchorRaw == raw })
            ).first else { return nil }
            return (CLLocationCoordinate2D(latitude: rec.latitude, longitude: rec.longitude), rec.radius)
        }
        // "label:<key>:<refID>"
        let parts = token.split(separator: ":", maxSplits: 2).map(String.init)
        guard parts.count == 3,
              let ref = dictionary.label(forKey: parts[1])?.refs.first(where: { $0.id == parts[2] }),
              let c = ref.coordinate
        else { return nil }
        return (CLLocationCoordinate2D(latitude: c.latitude, longitude: c.longitude), ref.radius)
    }

    private func rearmAllMonitoring() {
        location.stopAll()
        for m in moments where m.state == .armed || m.state == .awaitingNext {
            armMonitoringAndBackstop(for: m)
        }
    }

    /// Re-establish all monitoring after a cold launch or device restart (plan: Bootstrap).
    func bootstrapMonitoring() {
        rearmAllMonitoring()
    }

    // MARK: - Onboarding

    func completeOnboarding() {
        let rec = appStateRecord()
        rec.didOnboard = true
        didOnboard = true
        save()
    }

    // MARK: - small mutators

    private func replace(_ m: Moment) {
        persistMoments(moments.map { $0.id == m.id ? m : $0 })
    }
    private func replaceAll(_ updated: [Moment]) {
        persistMoments(updated)
    }
}
