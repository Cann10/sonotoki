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
            c.kind == .placeDeparture ? { Trigger.placeExit($0) } : { Trigger.placeEnter($0) }

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

// MARK: - Expansion（1 semantic ターゲット → 登録済みの複数の実場所 / 複数 Trigger）

/// semantic な `PlaceTarget` → 監視すべき Core Location リージョン識別子（token）群。
/// web の `expandPlaceIds` に対応。CLMonitor の条件セットアップに使う。
public func expandRegionTokens(_ target: PlaceTarget, dictionary: PlaceDictionary) -> [String] {
    switch target {
    case .anchor(let a):
        return ["anchor:\(a.rawValue)"]
    case .region(let token):
        return [token]
    case .label(let key):
        return dictionary.label(forKey: key)?.regionTokens ?? []
    }
}

/// semantic Trigger → 展開後の per-place Trigger 群。web の `expandTriggers` に対応。
public func expandTriggers(_ trigger: Trigger, dictionary: PlaceDictionary) -> [Trigger] {
    switch trigger {
    case .time:
        return [trigger]
    case .placeEnter(let target):
        return expandRegionTokens(target, dictionary: dictionary).map { .placeEnter(.region(token: $0)) }
    case .placeExit(let target):
        return expandRegionTokens(target, dictionary: dictionary).map { .placeExit(.region(token: $0)) }
    }
}
