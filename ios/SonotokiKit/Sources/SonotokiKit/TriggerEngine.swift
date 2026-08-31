import Foundation

// Deterministic trigger engine + Moment state machine.
// Ported from web/src/domain/engine.ts. Pure functions; no I/O, no CoreLocation.
//
// States: armed → fired → (done | awaitingNext) ; awaitingNext → armed
// "[次のそのとき]" は時間スヌーズではない。状況を抜けてから次に成立したとき再通知する。

public enum TriggerEngine {

    // MARK: - Matching

    public static func triggerMatches(_ trigger: Trigger, event: SituationEvent) -> Bool {
        switch (trigger, event) {
        case let (.placeEnter(target), .enter(token)):
            return target.matches(token: token)
        case let (.placeExit(target), .exit(token)):
            return target.matches(token: token)
        case let (.time(a), .time(b)):
            return a == b
        default:
            return false
        }
    }

    /// その Moment の「状況」が今まさに成立しているか。
    public static func contextActive(_ trigger: Trigger, world: WorldSnapshot) -> Bool {
        switch trigger {
        case .placeEnter(let target), .placeExit(let target):
            return world.insideTokens.contains { target.matches(token: $0) }
        case .time(let bucket):
            return world.lastTimeBucket == bucket
        }
    }

    public static func applyEventToWorld(_ world: WorldSnapshot, event: SituationEvent) -> WorldSnapshot {
        var w = world
        switch event {
        case .enter(let token): w.insideTokens.insert(token)
        case .exit(let token): w.insideTokens.remove(token)
        case .time(let bucket): w.lastTimeBucket = bucket
        }
        return w
    }

    // MARK: - Apply a situation event

    public struct ApplyResult: Sendable, Equatable {
        public var moments: [Moment]
        public var world: WorldSnapshot
        public var firedIDs: [String]

        public init(moments: [Moment], world: WorldSnapshot, firedIDs: [String]) {
            self.moments = moments
            self.world = world
            self.firedIDs = firedIDs
        }
    }

    /// 1) ワールド更新 → 2) 状況を抜けた awaitingNext を再武装 → 3) armed の一致判定で発火。
    public static func applySituation(
        moments: [Moment],
        world: WorldSnapshot,
        event: SituationEvent,
        now: Date = Date()
    ) -> ApplyResult {
        let nextWorld = applyEventToWorld(world, event: event)
        var firedIDs: [String] = []
        var justRearmed = Set<String>()

        var next = moments.map { m -> Moment in
            if m.state == .awaitingNext && !contextActive(m.trigger, world: nextWorld) {
                justRearmed.insert(m.id)
                var mm = m
                mm.state = .armed
                return mm
            }
            return m
        }

        next = next.map { m -> Moment in
            // 同じイベントで再武装した Moment はその場では発火させない
            // （例: 大学を出て再武装 → 次に大学を出るときに発火）
            guard m.state == .armed,
                  !justRearmed.contains(m.id),
                  triggerMatches(m.trigger, event: event)
            else { return m }

            firedIDs.append(m.id)
            var mm = m
            mm.state = .fired
            mm.firedCount += 1
            mm.lastFiredAt = now
            return mm
        }

        return ApplyResult(moments: next, world: nextWorld, firedIDs: firedIDs)
    }

    // MARK: - Actions

    /// [やった]
    public static func markDone(_ moments: [Moment], id: String) -> [Moment] {
        moments.map { m in
            guard m.id == id else { return m }
            var mm = m
            mm.state = .done
            return mm
        }
    }

    /// [次のそのとき] — 時間スヌーズではなく、同じ状況の次回に再通知。
    /// すでに状況から抜けていれば即 armed、まだ状況の中なら抜けるまで awaitingNext。
    public static func markNext(_ moments: [Moment], world: WorldSnapshot, id: String) -> [Moment] {
        moments.map { m in
            guard m.id == id else { return m }
            var mm = m
            mm.state = contextActive(m.trigger, world: world) ? .awaitingNext : .armed
            return mm
        }
    }

    // MARK: - Arming

    /// 選んだ候補から armed な Moment を作る。resolve できなければ nil。
    public static func armMoment(
        interpretation: MomentInterpretation,
        candidate: MomentCandidate,
        dictionary: PlaceDictionary,
        id: String,
        now: Date = Date(),
        forceTimeBackstop: Bool = false
    ) -> Moment? {
        guard case .ok(let trigger) = resolve(candidate, dictionary: dictionary) else {
            return nil
        }
        let backstop: TimeBucket? = trigger.isTime
            ? nil
            : ((forceTimeBackstop || candidate.hasDeadline) ? (candidate.timeBucket ?? .thisEvening) : nil)

        return Moment(
            id: id,
            originalText: interpretation.originalText,
            humanLabel: candidate.humanLabel,
            kind: candidate.kind,
            trigger: trigger,
            recurring: candidate.recurringHint,
            lowConfidence: candidate.confidence < 0.55,
            timeBackstop: backstop,
            state: .armed,
            createdAt: now,
            placePhrase: candidate.placePhrase,
            learnedPlace: candidate.learnedTarget != nil
        )
    }

    /// 独自の呼び方だが辞書に無い候補から、「場所を教えて」待ちの Moment を作る。
    public static func buildLearningMoment(
        interpretation: MomentInterpretation,
        candidate: MomentCandidate,
        id: String,
        now: Date = Date()
    ) -> Moment {
        Moment(
            id: id,
            originalText: interpretation.originalText,
            humanLabel: candidate.humanLabel,
            kind: candidate.kind,
            trigger: .time(.thisEvening),   // 仮置き。needsPlace の間はエンジンが評価しない
            recurring: candidate.recurringHint,
            lowConfidence: false,
            state: .needsPlace,
            createdAt: now,
            placePhrase: candidate.placePhrase,
            learnedPlace: false
        )
    }

    /// needs_place の Moment に実際の場所（ターゲット）を教えて armed にする。
    public static func resolveLearnedMoment(_ m: Moment, target: PlaceTarget) -> Moment {
        var mm = m
        let phrase = m.placePhrase ?? target.displayName
        mm.trigger = (m.kind == .placeDeparture) ? .placeExit(target) : .placeEnter(target)
        mm.humanLabel = (m.kind == .placeDeparture)
            ? "次に\(phrase)を出るとき"
            : "次に\(phrase)に着いたとき"
        mm.state = .armed
        mm.learnedPlace = true
        return mm
    }
}
