import Foundation
import SwiftData
import SonotokiKit

// SwiftData persistence for「そのとき」.
//
// The domain logic lives in SonotokiKit as pure value types (`Moment`,
// `PlaceDictionary`, …). These `@Model` records are just their on-disk form.
// `SonotokiStore` loads records → value types, runs the deterministic engine,
// then writes the results back. Everything is local; no account, no cloud.
//
// `Trigger` / `WorldSnapshot` are `Codable` in SonotokiKit, so we persist them as
// encoded `Data` and denormalise the few fields we actually query/sort on.

// MARK: - Moment

@Model
final class MomentRecord {
    @Attribute(.unique) var id: String
    var originalText: String
    var humanLabel: String
    var kindRaw: String
    var stateRaw: String
    var triggerData: Data          // encoded SonotokiKit.Trigger
    var isTimeTrigger: Bool        // denormalised for fetch predicates
    var recurring: Bool
    var lowConfidence: Bool
    var timeBackstopRaw: String?
    var createdAt: Date
    var firedCount: Int
    var lastFiredAt: Date?
    var placePhrase: String?
    var learnedPlace: Bool

    init(from m: Moment) {
        self.id = m.id
        self.originalText = m.originalText
        self.humanLabel = m.humanLabel
        self.kindRaw = m.kind.rawValue
        self.stateRaw = m.state.rawValue
        self.triggerData = (try? JSONEncoder().encode(m.trigger)) ?? Data()
        self.isTimeTrigger = m.trigger.isTime
        self.recurring = m.recurring
        self.lowConfidence = m.lowConfidence
        self.timeBackstopRaw = m.timeBackstop?.rawValue
        self.createdAt = m.createdAt
        self.firedCount = m.firedCount
        self.lastFiredAt = m.lastFiredAt
        self.placePhrase = m.placePhrase
        self.learnedPlace = m.learnedPlace
    }

    /// Overwrite this record from an updated value type (same `id`).
    func apply(_ m: Moment) {
        precondition(m.id == id, "MomentRecord.apply id mismatch")
        originalText = m.originalText
        humanLabel = m.humanLabel
        kindRaw = m.kind.rawValue
        stateRaw = m.state.rawValue
        triggerData = (try? JSONEncoder().encode(m.trigger)) ?? triggerData
        isTimeTrigger = m.trigger.isTime
        recurring = m.recurring
        lowConfidence = m.lowConfidence
        timeBackstopRaw = m.timeBackstop?.rawValue
        firedCount = m.firedCount
        lastFiredAt = m.lastFiredAt
        placePhrase = m.placePhrase
        learnedPlace = m.learnedPlace
    }

    func toValue() -> Moment? {
        guard
            let kind = SemanticKind(rawValue: kindRaw),
            let state = MomentState(rawValue: stateRaw),
            let trigger = try? JSONDecoder().decode(Trigger.self, from: triggerData)
        else { return nil }
        return Moment(
            id: id,
            originalText: originalText,
            humanLabel: humanLabel,
            kind: kind,
            trigger: trigger,
            recurring: recurring,
            lowConfidence: lowConfidence,
            timeBackstop: timeBackstopRaw.flatMap(TimeBucket.init(rawValue:)),
            state: state,
            createdAt: createdAt,
            firedCount: firedCount,
            lastFiredAt: lastFiredAt,
            placePhrase: placePhrase,
            learnedPlace: learnedPlace
        )
    }
}

// MARK: - Personal Place Dictionary

@Model
final class LearnedLabelRecord {
    @Attribute(.unique) var key: String     // placeKey-normalised
    var displayName: String
    var createdAt: Date
    @Relationship(deleteRule: .cascade, inverse: \PlaceRefRecord.label)
    var refs: [PlaceRefRecord]

    init(key: String, displayName: String, createdAt: Date = .now, refs: [PlaceRefRecord] = []) {
        self.key = key
        self.displayName = displayName
        self.createdAt = createdAt
        self.refs = refs
    }

    func toValue() -> LearnedLabel {
        LearnedLabel(
            key: key,
            displayName: displayName,
            refs: refs
                .sorted { $0.createdAt < $1.createdAt }
                .map { $0.toValue() },
            createdAt: createdAt
        )
    }
}

@Model
final class PlaceRefRecord {
    @Attribute(.unique) var id: String      // UUID string; also the CL region token suffix
    var nickname: String?
    var kindRaw: String                     // PlaceRefKind
    var latitude: Double?
    var longitude: Double?
    var radius: Double
    var poiCategory: String?
    var anchorRaw: String?
    var createdAt: Date
    var label: LearnedLabelRecord?

    init(from r: PlaceRef) {
        self.id = r.id
        self.nickname = r.nickname
        self.kindRaw = r.kind.rawValue
        self.latitude = r.coordinate?.latitude
        self.longitude = r.coordinate?.longitude
        self.radius = r.radius
        self.poiCategory = r.poiCategory
        self.anchorRaw = r.anchor?.rawValue
        self.createdAt = r.createdAt
    }

    func toValue() -> PlaceRef {
        PlaceRef(
            id: id,
            nickname: nickname,
            kind: PlaceRefKind(rawValue: kindRaw) ?? .coordinate,
            coordinate: (latitude != nil && longitude != nil)
                ? Coordinate(latitude: latitude!, longitude: longitude!) : nil,
            radius: radius,
            poiCategory: poiCategory,
            anchor: anchorRaw.flatMap(Anchor.init(rawValue:)),
            createdAt: createdAt
        )
    }
}

// MARK: - Fixed anchors (家 / 職場) — set once, one coordinate each

@Model
final class AnchorRecord {
    @Attribute(.unique) var anchorRaw: String   // "home" | "work"
    var latitude: Double
    var longitude: Double
    var radius: Double
    var setAt: Date

    init(anchor: Anchor, latitude: Double, longitude: Double, radius: Double = 150, setAt: Date = .now) {
        self.anchorRaw = anchor.rawValue
        self.latitude = latitude
        self.longitude = longitude
        self.radius = radius
        self.setAt = setAt
    }
}

// MARK: - Event log (armed / fired / done / next / corrected)

@Model
final class EventRecord {
    var momentID: String
    var typeRaw: String
    var at: Date
    var note: String?

    init(momentID: String, type: String, at: Date = .now, note: String? = nil) {
        self.momentID = momentID
        self.typeRaw = type
        self.at = at
        self.note = note
    }
}

// MARK: - Single app-state row (world snapshot + onboarding flags)

@Model
final class AppStateRecord {
    @Attribute(.unique) var singleton: Int = 0
    var worldSnapshotData: Data
    var didOnboard: Bool
    var notificationPermissionAsked: Bool

    init(worldSnapshot: WorldSnapshot = .init(), didOnboard: Bool = false) {
        self.worldSnapshotData = (try? JSONEncoder().encode(worldSnapshot)) ?? Data()
        self.didOnboard = didOnboard
        self.notificationPermissionAsked = false
    }

    var worldSnapshot: WorldSnapshot {
        get { (try? JSONDecoder().decode(WorldSnapshot.self, from: worldSnapshotData)) ?? .init() }
        set { worldSnapshotData = (try? JSONEncoder().encode(newValue)) ?? worldSnapshotData }
    }
}

// MARK: - Schema

enum SonotokiSchema {
    static let models: [any PersistentModel.Type] = [
        MomentRecord.self,
        LearnedLabelRecord.self,
        PlaceRefRecord.self,
        AnchorRecord.self,
        EventRecord.self,
        AppStateRecord.self,
    ]

    @MainActor
    static func container(inMemory: Bool = false) -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: inMemory)
        do {
            return try ModelContainer(
                for: Schema(models),
                configurations: config
            )
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }
}
