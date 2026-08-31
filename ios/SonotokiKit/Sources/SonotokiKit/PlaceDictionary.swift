import Foundation

// Personal Place Dictionary — ported from web/src/domain/placeDictionary.ts and
// extended so **one label can hold multiple places** (スーパー → 複数店舗).
//
// 「ユーザーの自然な呼び方 → 実際の場所（複数可）」を覚える。使うほど育つ。
// 初回に全部登録させず、必要になった場所だけ足していく。

// MARK: - placeKey (表記ゆれ正規化)

/// 照合キー。NFKC → 小文字 → 先頭の連体詞・末尾助詞を落とす。web版と同一ロジック。
public func placeKey(_ phrase: String) -> String {
    var s = phrase.precomposedStringWithCompatibilityMapping
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .lowercased()

    for prefix in ["その", "あの", "うちの", "いつもの", "例の"] where s.hasPrefix(prefix) {
        s = String(s.dropFirst(prefix.count))
        break
    }
    // web版と同じ優先順（1文字助詞を先に、その後 から/まで）
    for suffix in ["の", "へ", "に", "で", "を", "は", "から", "まで"] where s.hasSuffix(suffix) {
        s = String(s.dropLast(suffix.count))
        break
    }
    return s.trimmingCharacters(in: .whitespacesAndNewlines)
}

// MARK: - Place references

public struct Coordinate: Codable, Sendable, Equatable, Hashable {
    public var latitude: Double
    public var longitude: Double
    public init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }
}

public enum PlaceRefKind: String, Codable, Sendable, Equatable {
    case coordinate    // 実店舗など（緯度経度＋半径）
    case poiCategory   // MKPointOfInterestCategory（v1 では登録店を優先、これは将来用）
    case anchor        // 家 / 職場
}

/// 「いつもの場所」を構成する1地点。
public struct PlaceRef: Codable, Sendable, Equatable, Identifiable {
    public var id: String            // UUID 文字列。CL リージョン token に使う
    public var nickname: String?     // 「駅前の店」「実家の近くの」
    public var kind: PlaceRefKind
    public var coordinate: Coordinate?
    public var radius: Double         // メートル
    public var poiCategory: String?   // MKPointOfInterestCategory rawValue
    public var anchor: Anchor?
    public var createdAt: Date

    public init(
        id: String = UUID().uuidString,
        nickname: String? = nil,
        kind: PlaceRefKind,
        coordinate: Coordinate? = nil,
        radius: Double = 120,
        poiCategory: String? = nil,
        anchor: Anchor? = nil,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.nickname = nickname
        self.kind = kind
        self.coordinate = coordinate
        self.radius = radius
        self.poiCategory = poiCategory
        self.anchor = anchor
        self.createdAt = createdAt
    }

    /// coordinate ベースの ref を作る近道。
    public static func at(
        _ latitude: Double, _ longitude: Double,
        radius: Double = 120, nickname: String? = nil,
        id: String = UUID().uuidString, createdAt: Date = Date()
    ) -> PlaceRef {
        PlaceRef(
            id: id, nickname: nickname, kind: .coordinate,
            coordinate: Coordinate(latitude: latitude, longitude: longitude),
            radius: radius, createdAt: createdAt
        )
    }
}

/// ユーザーの呼び方 1つ（「スーパー」「ジム」「実家」）と、それに紐づく複数の実地点。
public struct LearnedLabel: Codable, Sendable, Equatable, Identifiable {
    public var key: String            // placeKey で正規化済み。ユニーク
    public var displayName: String    // 表示用（正規化前の見た目）
    public var refs: [PlaceRef]
    public var createdAt: Date

    public var id: String { key }

    public init(key: String, displayName: String, refs: [PlaceRef], createdAt: Date = Date()) {
        self.key = key
        self.displayName = displayName
        self.refs = refs
        self.createdAt = createdAt
    }

    /// この label の ref に対応する CL リージョン token 一覧。
    public var regionTokens: [String] { refs.map { "label:\(key):\($0.id)" } }
}

// MARK: - PlaceDictionary (value type)

public struct PlaceDictionary: Codable, Sendable, Equatable {
    public private(set) var labels: [String: LearnedLabel]

    public init(labels: [String: LearnedLabel] = [:]) {
        self.labels = labels
    }

    /// 既知で ref を1つ以上持つ label のキーを返す。無ければ nil（＝「どこ?」と聞く）。
    public func lookup(_ phrase: String) -> String? {
        let k = placeKey(phrase)
        guard let l = labels[k], !l.refs.isEmpty else { return nil }
        return k
    }

    public func label(forKey key: String) -> LearnedLabel? { labels[key] }

    public var allLabels: [LearnedLabel] {
        labels.values.sorted { $0.createdAt < $1.createdAt }
    }

    /// 呼び方に実地点を1つ結びつける。label が無ければ作り、あれば ref を足す。
    public mutating func learn(phrase: String, ref: PlaceRef, now: Date = Date()) {
        let k = placeKey(phrase)
        if var existing = labels[k] {
            existing.refs.append(ref)
            labels[k] = existing
        } else {
            let display = phrase.trimmingCharacters(in: .whitespacesAndNewlines)
            labels[k] = LearnedLabel(key: k, displayName: display, refs: [ref], createdAt: now)
        }
    }

    public mutating func addRef(labelKey: String, ref: PlaceRef) {
        guard var l = labels[labelKey] else { return }
        l.refs.append(ref)
        labels[labelKey] = l
    }

    public mutating func removeRef(labelKey: String, refID: String) {
        guard var l = labels[labelKey] else { return }
        l.refs.removeAll { $0.id == refID }
        if l.refs.isEmpty {
            labels[labelKey] = nil
        } else {
            labels[labelKey] = l
        }
    }

    public mutating func forget(phrase: String) {
        labels[placeKey(phrase)] = nil
    }
}
