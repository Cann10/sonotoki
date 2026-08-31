import SwiftUI
import SonotokiKit

/// "覚えた場所" — the Personal Place Dictionary, one label → many places.
/// Ports web/src/ui/LearnedPlaces.tsx. Shown from MyPlacesView.
struct LearnedPlacesView: View {
    let dictionary: PlaceDictionary
    @Environment(SonotokiStore.self) private var store
    @State private var addingTo: LabelKey?

    private struct LabelKey: Identifiable { let id: String }

    var body: some View {
        let labels = dictionary.allLabels
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text("覚えた場所").font(Typo.ui(15, weight: .medium)).foregroundStyle(Palette.ink)
                Text("\(labels.count)").font(Typo.ui(13)).foregroundStyle(Palette.ink3)
            }

            ForEach(labels) { label in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(label.displayName).font(Typo.ui(14, weight: .medium)).foregroundStyle(Palette.ink)
                        Text("→").foregroundStyle(Palette.ink3)
                        Spacer()
                        Button("忘れる") { store.forgetLabel(label.key) }
                            .font(Typo.ui(12)).foregroundStyle(Palette.ink3)
                    }
                    FlowRow(spacing: 6) {
                        ForEach(label.refs) { ref in
                            HStack(spacing: 4) {
                                Text(ref.nickname ?? label.displayName).font(Typo.ui(12))
                                Button {
                                    store.removeRef(labelKey: label.key, refID: ref.id)
                                } label: { Image(systemName: "xmark").font(.system(size: 9)) }
                            }
                            .foregroundStyle(Palette.ink2)
                            .padding(.vertical, 3).padding(.horizontal, 8)
                            .background(Palette.surface2)
                            .clipShape(Capsule())
                        }
                        Button {
                            addingTo = LabelKey(id: label.key)
                        } label: {
                            Label("場所", systemImage: "plus").font(Typo.ui(12))
                        }
                        .foregroundStyle(Palette.ink3)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 14)
                .cardSurface()
            }
        }
        .sheet(item: $addingTo) { entry in
            PlacePickerView { coordinate, radius in
                store.addRef(labelKey: entry.id, ref: .at(coordinate.latitude, coordinate.longitude, radius: radius))
            }
        }
    }
}

/// Very small wrap layout for pills (SwiftUI has no built-in until iOS 16 Layout).
struct FlowRow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for v in subviews {
            let size = v.sizeThatFits(.unspecified)
            if x + size.width > maxWidth {
                x = 0; y += rowHeight + spacing; rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth == .infinity ? x : maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for v in subviews {
            let size = v.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX {
                x = bounds.minX; y += rowHeight + spacing; rowHeight = 0
            }
            v.place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
