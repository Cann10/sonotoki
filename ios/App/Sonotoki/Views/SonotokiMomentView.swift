import SwiftUI
import SonotokiKit

/// The「そのときです。」moment — the app's signature screen.
/// Ported from web/src/ui/SonotokiMoment.tsx (the 2026-08-31 redesign): one flat
/// warm field, a big Mincho headline, the memo, a quiet condition line, and two
/// clear actions. No gradient, one restrained entrance animation.
struct SonotokiMomentView: View {
    let moment: Moment
    var queueRemaining: Int = 0
    let onDone: () -> Void
    let onNext: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false

    var body: some View {
        ZStack {
            Palette.glow.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer(minLength: 0)

                Text("そ の と き")
                    .font(Typo.ui(12, weight: .medium))
                    .tracking(6)
                    .foregroundStyle(Palette.onGlow2)
                    .padding(.bottom, 16)
                    .opacity(appeared ? 1 : 0)

                Text("そのときです。")
                    .font(Typo.headline(40))
                    .tracking(-1)
                    .foregroundStyle(Palette.onGlow)
                    .multilineTextAlignment(.center)
                    .rise(appeared, delay: 0.05, reduceMotion: reduceMotion)

                Text(moment.originalText)
                    .font(Typo.memo(22))
                    .foregroundStyle(Palette.onGlow)
                    .multilineTextAlignment(.center)
                    .padding(.top, 6)
                    .rise(appeared, delay: 0.12, reduceMotion: reduceMotion)

                Text(moment.humanLabel)
                    .font(Typo.ui(14))
                    .foregroundStyle(Palette.onGlow2)
                    .multilineTextAlignment(.center)
                    .padding(.top, 6)
                    .rise(appeared, delay: 0.18, reduceMotion: reduceMotion)

                VStack(spacing: 12) {
                    Button(action: onDone) {
                        Label("やった", systemImage: "checkmark")
                            .font(Typo.ui(16, weight: .medium))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                    }
                    .buttonStyle(FirePrimaryButton())

                    Button(action: onNext) {
                        Label("次のそのとき", systemImage: "arrow.triangle.2.circlepath")
                            .font(Typo.ui(16, weight: .medium))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                    }
                    .buttonStyle(FireGhostButton())
                }
                .padding(.top, 28)
                .rise(appeared, delay: 0.24, reduceMotion: reduceMotion)

                Text("「次のそのとき」は時間で鳴らしません。また同じ状況になったときに戻します。")
                    .font(Typo.ui(12))
                    .foregroundStyle(Palette.onGlow2)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 320)
                    .padding(.top, 20)
                    .rise(appeared, delay: 0.30, reduceMotion: reduceMotion)

                if moment.firedCount > 1 {
                    Text("この条件で戻ってくるのは \(moment.firedCount) 回目")
                        .font(Typo.ui(12))
                        .foregroundStyle(Palette.onGlow2)
                        .padding(.top, 14)
                }
                if queueRemaining > 0 {
                    Text("ほかにも \(queueRemaining) 件、そのときが来ています")
                        .font(Typo.ui(12))
                        .foregroundStyle(Palette.onGlow2)
                        .padding(.top, 10)
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 28)
        }
        .accessibilityAddTraits(.isModal)
        .onAppear {
            if reduceMotion { appeared = true }
            else { withAnimation(.easeOut(duration: 0.24)) { appeared = true } }
        }
    }
}

// MARK: - Button styles

private struct FirePrimaryButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(Color(hex: 0xFBF3EA))
            .background(Palette.onGlow)
            .clipShape(RoundedRectangle(cornerRadius: Corner.button))
            .opacity(configuration.isPressed ? 0.9 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

private struct FireGhostButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(Palette.onGlow)
            .overlay(
                RoundedRectangle(cornerRadius: Corner.button)
                    .stroke(Palette.onGlow.opacity(0.35), lineWidth: 1.5)
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

// MARK: - "rise" entrance (mirrors the web @keyframes rise)

private extension View {
    func rise(_ shown: Bool, delay: Double, reduceMotion: Bool) -> some View {
        self
            .opacity(shown ? 1 : 0)
            .offset(y: (shown || reduceMotion) ? 0 : 10)
            .animation(
                reduceMotion ? nil : .easeOut(duration: 0.42).delay(delay),
                value: shown
            )
    }
}
