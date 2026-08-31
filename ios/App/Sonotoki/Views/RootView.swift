import SwiftUI
import SonotokiKit

/// Main screen: masthead → input → (inline confirmation) → Moment list.
/// Ports the shape of web/src/App.tsx working state. The web "situation
/// simulator" panel is intentionally gone — on device the situations are real.
struct RootView: View {
    @Environment(SonotokiStore.self) private var store
    @State private var draft = ""
    @State private var showMyPlaces = false

    private var isEmpty: Bool { store.moments.isEmpty }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    masthead

                    NoteInputView(text: $draft) { text in
                        store.submit(text)
                        draft = ""
                    }

                    if let inference = store.lastInference {
                        InferenceToastView(inference: inference)
                    }

                    if isEmpty {
                        OnboardingHint { phrase in store.submit(phrase) }
                    } else {
                        MomentListView(moments: store.moments, dictionary: store.dictionary)
                    }

                    footNote
                }
                .padding(.horizontal, 22)
                .padding(.vertical, 20)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
            .background(Palette.paper)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("いつもの場所") { showMyPlaces = true }
                        .font(Typo.ui(13))
                        .foregroundStyle(Palette.ink3)
                }
            }
            .sheet(isPresented: $showMyPlaces) {
                MyPlacesView()
            }
        }
    }

    private var masthead: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text("そのとき")
                    .font(Typo.memo(24))
                    .tracking(3)
                    .foregroundStyle(Palette.ink)
                Circle().fill(Palette.moment).frame(width: 5, height: 5)
            }
            Text("覚えておかなくていいメモ。書くのは “何を” だけ。“いつ・どこで” は、そのときが決めます。")
                .font(Typo.ui(14))
                .foregroundStyle(Palette.ink2)
                .lineSpacing(4)
                .frame(maxWidth: 420, alignment: .leading)
        }
        .padding(.top, 8)
    }

    private var footNote: some View {
        Text("入力もトリガーも端末内で完結します。位置情報は一切送信しません。アカウントは不要です。")
            .font(Typo.ui(12))
            .foregroundStyle(Palette.ink3)
            .lineSpacing(3)
            .frame(maxWidth: 380, alignment: .leading)
            .padding(.top, 12)
            .overlay(alignment: .top) {
                Rectangle().fill(Palette.line).frame(height: 1).offset(y: -12)
            }
    }
}

/// Empty-state nudge — one tap to place the first memo. Mirrors Onboarding.tsx's try card.
struct OnboardingHint: View {
    let onTry: (String) -> Void

    var body: some View {
        VStack(spacing: 16) {
            Button {
                onTry("牛乳なくなりそう")
            } label: {
                VStack(spacing: 6) {
                    Text("牛乳なくなりそう").font(Typo.memo(18)).foregroundStyle(Palette.ink)
                    Text("と書いて、置いてみる").font(Typo.ui(12)).foregroundStyle(Palette.ink3)
                }
                .frame(maxWidth: 340)
                .padding(.vertical, 18)
                .padding(.horizontal, 20)
                .cardSurface()
            }
            .buttonStyle(.plain)

            HStack(spacing: 8) {
                Text("書く"); dash; Text("場所へ行く"); dash; Text("そのとき、戻ってくる")
            }
            .font(Typo.ui(12))
            .foregroundStyle(Palette.ink3)
        }
        .frame(maxWidth: .infinity)
    }

    private var dash: some View { Text("—").foregroundStyle(Palette.line2) }
}
