import SwiftUI
import SonotokiKit

/// Sectioned Moment list. Ports web/src/ui/MomentList.tsx section rules and the
/// card layout (Mincho memo → thread hairline → warm-dot condition → quiet tags).
struct MomentListView: View {
    let moments: [Moment]
    let dictionary: PlaceDictionary
    @Environment(SonotokiStore.self) private var store

    private struct Section: Identifiable {
        let id: String
        let title: String
        let match: (Moment) -> Bool
    }

    private let sections: [Section] = [
        .init(id: "teach",   title: "場所を教えてください") { $0.state == .needsPlace },
        .init(id: "waiting", title: "待っているそのとき") { $0.state == .armed || $0.state == .fired },
        .init(id: "again",   title: "次のそのとき待ち") { $0.state == .awaitingNext },
        .init(id: "done",    title: "すんだこと") { $0.state == .done },
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            ForEach(sections) { section in
                let items = moments.filter(section.match)
                if !items.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 8) {
                            Text(section.title).font(Typo.ui(15, weight: .medium)).foregroundStyle(Palette.ink)
                            Text("\(items.count)").font(Typo.ui(13)).foregroundStyle(Palette.ink3)
                        }
                        ForEach(items) { moment in
                            MomentCardView(moment: moment, dictionary: dictionary)
                        }
                    }
                }
            }
        }
    }
}

struct MomentCardView: View {
    let moment: Moment
    let dictionary: PlaceDictionary
    @Environment(SonotokiStore.self) private var store

    private var done: Bool { moment.state == .done }
    private var needsPlace: Bool { moment.state == .needsPlace }

    private var learnedPlaces: String {
        guard !moment.trigger.isTime else { return "" }
        return expandRegionTokens(placeTarget, dictionary: dictionary)
            .compactMap { labelForToken($0) }
            .joined(separator: "・")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(moment.originalText)
                .font(Typo.memo(18))
                .foregroundStyle(Palette.ink)
                .strikethrough(done, color: Palette.ink3)

            if needsPlace {
                TeachPlaceView(phrase: moment.placePhrase ?? "その場所") { ref in
                    store.teachPlace(momentID: moment.id, phrase: moment.placePhrase ?? "", ref: ref)
                }
                .padding(.top, 10)
            } else {
                ThreadLine().padding(.vertical, 8)

                HStack(alignment: .center, spacing: 8) {
                    MomentDot(color: done ? Palette.ink3 : Palette.moment)
                    Text(moment.humanLabel)
                        .font(Typo.ui(14, weight: .medium))
                        .foregroundStyle(Palette.ink2)
                    tagRow
                }
            }

            if !done && !needsPlace {
                Divider().overlay(Palette.line).padding(.top, 12)
                HStack(spacing: 16) {
                    Button("直す") { /* TODO: repick sheet */ }
                    Button("やめる") { store.remove(momentID: moment.id) }
                }
                .font(Typo.ui(13))
                .foregroundStyle(Palette.ink3)
                .padding(.top, 10)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .cardSurface()
        .opacity(done ? 0.6 : 1)
    }

    @ViewBuilder private var tagRow: some View {
        if moment.learnedPlace, let phrase = moment.placePhrase, !learnedPlaces.isEmpty {
            Text("「\(phrase)」＝ \(learnedPlaces)")
                .font(Typo.ui(12))
                .foregroundStyle(Palette.ink2)
                .padding(.vertical, 2).padding(.horizontal, 8)
                .background(Palette.surface2)
                .clipShape(Capsule())
        }
        if moment.recurring {
            Text("くりかえし").quietPill()
        }
        if moment.firedCount > 0 {
            Text("\(moment.firedCount)回 戻ってきた")
                .font(Typo.ui(12))
                .foregroundStyle(Palette.moment)
                .padding(.vertical, 2).padding(.horizontal, 8)
                .overlay(Capsule().stroke(Palette.moment.opacity(0.3), lineWidth: 1))
        }
        if moment.timeBackstop != nil {
            Text("時間でも念のため").quietPill()
        }
        if moment.lowConfidence && !done {
            Text("たしかめる").quietPill()
        }
    }

    private var placeTarget: PlaceTarget {
        switch moment.trigger {
        case .placeEnter(let t), .placeExit(let t): return t
        case .time: return .label("")
        }
    }

    /// "label:<key>:<refID>" or "anchor:home" → a human label for the tag.
    private func labelForToken(_ token: String) -> String? {
        if token.hasPrefix("anchor:") {
            return token.hasSuffix("home") ? "家" : "職場"
        }
        let parts = token.split(separator: ":", maxSplits: 2).map(String.init)
        guard parts.count == 3 else { return nil }
        let ref = dictionary.label(forKey: parts[1])?.refs.first { $0.id == parts[2] }
        return ref?.nickname ?? dictionary.label(forKey: parts[1])?.displayName
    }
}
