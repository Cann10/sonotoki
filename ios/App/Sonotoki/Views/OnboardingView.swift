import SwiftUI
import SonotokiKit

/// Three beats (plan §13 §6): concept + example → place one memo → notification
/// permission. 自宅登録は任意で後から。Keep it short; this is the only place
/// notification permission may block completion.
struct OnboardingView: View {
    @Environment(SonotokiStore.self) private var store
    @Environment(AppEnvironment.self) private var env
    @State private var page = 0

    var body: some View {
        VStack {
            TabView(selection: $page) {
                concept.tag(0)
                tryIt.tag(1)
                permission.tag(2)
            }
            .tabViewStyle(.page(indexDisplayMode: .always))
        }
        .background(Palette.paper)
    }

    private var concept: some View {
        VStack(spacing: 16) {
            Spacer()
            Text("そのとき").font(Typo.headline(34)).foregroundStyle(Palette.ink)
            Text("覚えておかなくていいメモ。\n書くのは “何を” だけ。\n“いつ・どこで” は、そのときが決めます。")
                .font(Typo.ui(15)).foregroundStyle(Palette.ink2)
                .multilineTextAlignment(.center).lineSpacing(5)
            Spacer()
            nextButton("つぎへ") { page = 1 }
        }
        .padding(28)
    }

    private var tryIt: some View {
        VStack(spacing: 16) {
            Spacer()
            Text("たとえば").font(Typo.ui(13)).tracking(4).foregroundStyle(Palette.ink3)
            Text("牛乳なくなりそう").font(Typo.memo(22)).foregroundStyle(Palette.ink)
            Text("と書いておくと、次にスーパーへ着いたときに戻ってきます。")
                .font(Typo.ui(14)).foregroundStyle(Palette.ink2)
                .multilineTextAlignment(.center)
            Spacer()
            nextButton("なるほど") { page = 2 }
        }
        .padding(28)
    }

    private var permission: some View {
        VStack(spacing: 16) {
            Spacer()
            Text("お知らせの許可").font(Typo.headline(26)).foregroundStyle(Palette.ink)
            Text("「そのとき」が来たことをお知らせするために、通知を使います。位置情報は後で、最初に場所のメモを作るときに聞きます。")
                .font(Typo.ui(14)).foregroundStyle(Palette.ink2)
                .multilineTextAlignment(.center).lineSpacing(4)
            Spacer()
            nextButton("はじめる") {
                Task {
                    _ = await env.notifier.requestAuthorization()
                    store.completeOnboarding()
                }
            }
        }
        .padding(28)
    }

    private func nextButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .font(Typo.ui(16, weight: .medium))
            .foregroundStyle(Palette.surface)
            .frame(maxWidth: .infinity).padding(.vertical, 15)
            .background(Palette.ink)
            .clipShape(RoundedRectangle(cornerRadius: Corner.button))
    }
}
