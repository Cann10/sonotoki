import Foundation

// Deterministic Resolver — semantic Moment → one of three trigger primitives.
// No AI here. Ported from web/src/domain/resolver.ts, adapted for 1-label-N-places.

public enum ResolveResult: Sendable, Equatable {
    case ok(Trigger)
    /// 独自の呼び方だが辞書に無い → 一度だけ「どこ?」と尋ねる。
    case needsLearning(phrase: String)
    case failed(reason: String)
}

public func resolve(_ c: MomentCandidate, dictionary: PlaceDictionary) -> ResolveResult {
    switch c.kind {
    case .time:
        guard let bucket = c.timeBucket else {
            return .failed(reason: "時間帯が特定できませんでした")
        }
        return .ok(.time(bucket))

    case .homeArrival:
        return .ok(.placeEnter(.anchor(.home)))
    case .leaveHome:
        return .ok(.placeExit(.anchor(.home)))
    case .workArrival:
        return .ok(.placeEnter(.anchor(.work)))

    case .placeArrival, .placeDeparture:
        let make: (PlaceTarget) -> Trigger =
            c.kind == .placeDeparture ? Trigger.placeExit : Trigger.placeEnter

        if let anchor = c.anchorHint {
            return .ok(make(.anchor(anchor)))
        }
        if let target = c.learnedTarget {
            return .ok(make(target))
        }
        guard let phrase = c.placePhrase ?? c.placeLabel, !phrase.isEmpty else {
            return .failed(reason: "場所が特定できませんでした")
        }
        if let key = dictionary.lookup(phrase) {
            return .ok(make(.label(key)))
        }
        return .needsLearning(phrase: phrase)
    }
}
