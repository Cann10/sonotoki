import Foundation

// Canonical domain model for「そのとき」— ported from web/src/domain/types.ts.
// Platform-agnostic. No CoreLocation / SwiftUI / SwiftData here.
// AI (meaning) produces `MomentInterpretation`; the deterministic engine only
// ever deals with `Trigger` (three primitives).

// MARK: - Semantic layer (what the AI understands)

/// What kind of real-world situation should bring a memo back.
public enum SemanticKind: String, Codable, Sendable, Equatable {
    case placeArrival     // 〜に着いたとき
    case placeDeparture   // 〜を出るとき
    case homeArrival      // 帰宅したとき
    case leaveHome        // 出かけるとき
    case workArrival      // 出社したとき
    case time             // 時間帯
}

public enum TimeBucket: String, Codable, Sendable, Equatable, CaseIterable {
    case thisEvening
    case tomorrowMorning

    public var label: String {
        switch self {
        case .thisEvening: return "今日の夕方"
        case .tomorrowMorning: return "明日の朝"
        }
    }
}

public enum Direction: String, Codable, Sendable, Equatable {
    case arrival
    case departure
}

/// A fixed personal anchor. Its coordinate is set once by the user.
public enum Anchor: String, Codable, Sendable, Equatable {
    case home
    case work

    public var displayName: String {
        switch self {
        case .home: return "家"
        case .work: return "職場"
        }
    }
}

/// One way the interpreter thinks a memo could resurface.
public struct MomentCandidate: Codable, Sendable, Equatable {
    public var kind: SemanticKind
    public var placeLabel: String?          // 人が読むラベル（「スーパー」「大学」）
    public var poiCategoryHint: String?     // MKPointOfInterestCategory rawValue（将来用のヒント）
    public var direction: Direction?
    public var timeBucket: TimeBucket?
    /// 入力から期限が読み取れたときだけ true（時間バックストップの条件）。
    public var hasDeadline: Bool
    /// 同じ状況で何度も戻したい類のメモか（買い物など）。
    public var recurringHint: Bool
    public var confidence: Double            // 0...1
    public var humanLabel: String           // 「次にスーパーに着いたとき」
    /// ユーザー独自の呼び方（「ジム」「実家」「スーパー」「大学」）。帰宅/出社では nil。
    public var placePhrase: String?
    /// その呼び方を Personal Place Dictionary が解決できたときのターゲット。
    public var learnedTarget: PlaceTarget?
    /// 独自の呼び方だがまだ辞書に無い → ユーザーに一度だけ場所を尋ねる。
    public var needsPlaceLearning: Bool
    /// 「会社」「職場」など、固定アンカーに直結する場合（辞書を通さない）。
    public var anchorHint: Anchor?

    public init(
        kind: SemanticKind,
        placeLabel: String? = nil,
        poiCategoryHint: String? = nil,
        direction: Direction? = nil,
        timeBucket: TimeBucket? = nil,
        hasDeadline: Bool = false,
        recurringHint: Bool = false,
        confidence: Double,
        humanLabel: String,
        placePhrase: String? = nil,
        learnedTarget: PlaceTarget? = nil,
        needsPlaceLearning: Bool = false,
        anchorHint: Anchor? = nil
    ) {
        self.kind = kind
        self.placeLabel = placeLabel
        self.poiCategoryHint = poiCategoryHint
        self.direction = direction
        self.timeBucket = timeBucket
        self.hasDeadline = hasDeadline
        self.recurringHint = recurringHint
        self.confidence = confidence
        self.humanLabel = humanLabel
        self.placePhrase = placePhrase
        self.learnedTarget = learnedTarget
        self.needsPlaceLearning = needsPlaceLearning
        self.anchorHint = anchorHint
    }
}

public struct MomentInterpretation: Codable, Sendable, Equatable {
    public var originalText: String
    public var category: String?            // "shopping" | "belongings" | "errand" | "message"
    public var moments: [MomentCandidate]   // 確信度の高い順
    public var needsUserConfirmation: Bool
    public var ambiguityNote: String?

    public init(
        originalText: String,
        category: String? = nil,
        moments: [MomentCandidate],
        needsUserConfirmation: Bool,
        ambiguityNote: String? = nil
    ) {
        self.originalText = originalText
        self.category = category
        self.moments = moments
        self.needsUserConfirmation = needsUserConfirmation
        self.ambiguityNote = ambiguityNote
    }
}

// MARK: - Trigger primitives (the deterministic engine only knows these three)

/// Which real place a place-trigger points at.
/// - `.anchor` は単一地点（家 / 職場）。
/// - `.label` は「いつもの場所」の呼び方。1 ラベルに複数の実 `PlaceRef` が紐づき、
///   そのどれか一つに enter/exit で成立する（スーパー → 複数店舗）。
/// - `.region` は展開後の1地点（`Resolver.expandTriggers` の出力。CL リージョン token）。
public enum PlaceTarget: Codable, Sendable, Equatable, Hashable {
    case anchor(Anchor)
    case label(String)          // LearnedLabel.key（semantic。Moment が保持するのはこれ）
    case region(token: String)  // 展開後の1地点

    /// Core Location のリージョン識別子（token）がこのターゲットに属するか。
    /// token 形式: "anchor:home" / "anchor:work" / "label:<key>:<refID>"
    public func matches(token: String) -> Bool {
        switch self {
        case .anchor(let a): return token == "anchor:\(a.rawValue)"
        case .label(let key): return token.hasPrefix("label:\(key):")
        case .region(let t): return token == t
        }
    }

    public var displayName: String {
        switch self {
        case .anchor(let a): return a.displayName
        case .label(let key): return key
        case .region(let t): return t
        }
    }
}

public enum Trigger: Codable, Sendable, Equatable {
    case placeEnter(PlaceTarget)
    case placeExit(PlaceTarget)
    case time(TimeBucket)

    public var isTime: Bool { if case .time = self { return true } else { return false } }
}

// MARK: - Moment (a memo armed to a trigger)

public enum MomentState: String, Codable, Sendable, Equatable {
    case armed
    case awaitingNext       // [次のそのとき] 済み。状況を抜けたら armed に戻る
    case fired              // 発火直後、ユーザーの操作待ち
    case done
    case needsPlace         // 独自の呼び方をまだ実際の場所に結び付けていない
}

public struct Moment: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var originalText: String
    public var humanLabel: String
    public var kind: SemanticKind
    public var trigger: Trigger
    public var recurring: Bool
    public var lowConfidence: Bool
    /// 時間でも念のため知らせる（期限が読み取れた / 手動で付けた場合のみ）。
    public var timeBackstop: TimeBucket?
    public var state: MomentState
    public var createdAt: Date
    public var firedCount: Int
    public var lastFiredAt: Date?
    /// このメモが独自の呼び方から生まれた場合、その呼び方（「ジム」など）。
    public var placePhrase: String?
    /// その呼び方を辞書が解決した（＝「覚えています」表示の対象）。
    public var learnedPlace: Bool

    public init(
        id: String,
        originalText: String,
        humanLabel: String,
        kind: SemanticKind,
        trigger: Trigger,
        recurring: Bool,
        lowConfidence: Bool,
        timeBackstop: TimeBucket? = nil,
        state: MomentState,
        createdAt: Date,
        firedCount: Int = 0,
        lastFiredAt: Date? = nil,
        placePhrase: String? = nil,
        learnedPlace: Bool = false
    ) {
        self.id = id
        self.originalText = originalText
        self.humanLabel = humanLabel
        self.kind = kind
        self.trigger = trigger
        self.recurring = recurring
        self.lowConfidence = lowConfidence
        self.timeBackstop = timeBackstop
        self.state = state
        self.createdAt = createdAt
        self.firedCount = firedCount
        self.lastFiredAt = lastFiredAt
        self.placePhrase = placePhrase
        self.learnedPlace = learnedPlace
    }
}

// MARK: - World snapshot & situation events

/// いま「中にいる」リージョン識別子の集合と、直近に通過した時間帯。
/// Web版の `WorldState.location`（単一）を、重なり得る複数リージョンに拡張したもの。
public struct WorldSnapshot: Codable, Sendable, Equatable {
    public var insideTokens: Set<String>
    public var lastTimeBucket: TimeBucket?

    public init(insideTokens: Set<String> = [], lastTimeBucket: TimeBucket? = nil) {
        self.insideTokens = insideTokens
        self.lastTimeBucket = lastTimeBucket
    }
}

public enum SituationEvent: Codable, Sendable, Equatable {
    case enter(token: String)
    case exit(token: String)
    case time(TimeBucket)
}
