import SwiftUI

/// Single-field capture. Ports web/src/ui/NoteInput.tsx: a Mincho field, a quiet
/// label, and an「あずける」button that only lights up with content.
struct NoteInputView: View {
    @Binding var text: String
    var onSubmit: (String) -> Void

    @FocusState private var focused: Bool

    private var trimmed: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("いま頭にあることを、ひとつ。")
                .font(Typo.ui(15, weight: .medium))
                .foregroundStyle(Palette.ink2)

            HStack(alignment: .bottom, spacing: 12) {
                TextField(
                    "牛乳なくなりそう / 傘、大学に置いてきた …",
                    text: $text,
                    axis: .vertical
                )
                .font(Typo.memo(18))
                .foregroundStyle(Palette.ink)
                .tint(Palette.moment)
                .focused($focused)
                .lineLimit(1...4)
                .onSubmit(submit)

                Button("あずける", action: submit)
                    .font(Typo.ui(15, weight: .medium))
                    .foregroundStyle(trimmed.isEmpty ? Palette.ink3 : Palette.surface)
                    .padding(.vertical, 11)
                    .padding(.horizontal, 18)
                    .background(trimmed.isEmpty ? Palette.surface2 : Palette.ink)
                    .clipShape(RoundedRectangle(cornerRadius: Corner.button))
                    .disabled(trimmed.isEmpty)
            }
        }
        .padding(18)
        .cardSurface()
    }

    private func submit() {
        guard !trimmed.isEmpty else { return }
        onSubmit(trimmed)
        focused = false
    }
}
