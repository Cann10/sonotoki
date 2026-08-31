import SwiftUI
import SonotokiKit

/// The inline confirmation right after `submit`. Ports web/src/ui/InferenceToast.tsx:
/// a calm light card with a warm dot, the resolved Moment label in 「」, and quiet
/// "ちがう / 取り消す" actions. Candidate re-pick is a TODO sheet.
struct InferenceToastView: View {
    let inference: SonotokiStore.PendingInference
    @Environment(SonotokiStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let phrase = inference.teachPhrase {
                Text("「\(phrase)」の場所を教えてください")
                    .font(Typo.ui(15, weight: .medium))
                    .foregroundStyle(Palette.ink)
            } else if let label = topLabel {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Circle().fill(Palette.moment).frame(width: 7, height: 7)
                    (Text("「") + Text(label).font(Typo.ui(15, weight: .medium)) + Text("」")
                        + Text(inference.needsConfirm ? "でいい?" : "に戻します"))
                        .font(Typo.ui(15))
                        .foregroundStyle(Palette.ink)
                }
                if let note = inference.learnedNote {
                    Text("「\(note.phrase)」＝ \(note.target.displayName) として覚えました")
                        .font(Typo.ui(12))
                        .foregroundStyle(Palette.moment)
                }
            }

            HStack(spacing: 16) {
                if !inference.needsConfirm {
                    Button("ちがう") { /* TODO: candidate re-pick sheet */ }
                }
                Button("取り消す") {
                    store.remove(momentID: inference.momentID)
                    store.lastInference = nil
                }
            }
            .font(Typo.ui(13))
            .foregroundStyle(Palette.ink3)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: Corner.card))
        .overlay(alignment: .leading) {
            if inference.needsConfirm {
                Rectangle().fill(Palette.moment).frame(width: 3)
            }
        }
        .overlay(RoundedRectangle(cornerRadius: Corner.card).stroke(Palette.line, lineWidth: 1))
    }

    private var topLabel: String? {
        inference.interpretation.moments.first?.humanLabel
    }
}
