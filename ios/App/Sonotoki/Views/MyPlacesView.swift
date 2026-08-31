import SwiftUI
import SwiftData
import CoreLocation
import SonotokiKit

/// 家 / 職場 の登録（1回だけ）＋「覚えた場所」の管理。Plan §13 「マイプレイス」。
struct MyPlacesView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Environment(SonotokiStore.self) private var store

    @Query private var anchors: [AnchorRecord]
    @State private var settingAnchor: AnchorChoice?

    private struct AnchorChoice: Identifiable { let anchor: Anchor; var id: String { anchor.rawValue } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("決まった場所").font(Typo.ui(15, weight: .medium)).foregroundStyle(Palette.ink)
                        anchorRow(.home)
                        anchorRow(.work)
                    }
                    LearnedPlacesView(dictionary: store.dictionary)
                }
                .padding(20)
            }
            .background(Palette.paper)
            .navigationTitle("いつもの場所")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("閉じる") { dismiss() } }
            }
            .sheet(item: $settingAnchor) { choice in
                PlacePickerView { coordinate, radius in
                    setAnchor(choice.anchor, coordinate: coordinate, radius: radius)
                }
            }
        }
    }

    private func anchorRow(_ anchor: Anchor) -> some View {
        let existing = anchors.first { $0.anchorRaw == anchor.rawValue }
        return HStack {
            Text(anchor.displayName).font(Typo.ui(14, weight: .medium)).foregroundStyle(Palette.ink)
            Spacer()
            Button(existing == nil ? "登録する" : "変更") { settingAnchor = AnchorChoice(anchor: anchor) }
                .font(Typo.ui(13)).foregroundStyle(Palette.moment)
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .cardSurface()
    }

    private func setAnchor(_ anchor: Anchor, coordinate: CLLocationCoordinate2D, radius: CLLocationDistance) {
        for r in anchors where r.anchorRaw == anchor.rawValue { context.delete(r) }
        context.insert(AnchorRecord(
            anchor: anchor, latitude: coordinate.latitude, longitude: coordinate.longitude, radius: radius
        ))
        try? context.save()
        store.bootstrapMonitoring()
    }
}
