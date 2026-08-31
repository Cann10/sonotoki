import SwiftUI

// Design tokens ported from web/src/index.css (the polished 2026-08-31 redesign).
// Calm cool-neutral palette; the single warm `moment` accent is reserved almost
// entirely for the fire screen. Two type roles:
//   display = Shippori Mincho  → memo text, big headlines
//   ui      = IBM Plex Sans JP → chrome, labels, buttons
//
// FONTS: bundle the Google Fonts TTFs and register them in Info.plist → UIAppFonts
//   ShipporiMincho-Regular/Medium/SemiBold/Bold.ttf
//   IBMPlexSansJP-Regular/Medium/SemiBold.ttf
// PostScript names below; if a face is missing SwiftUI falls back to the system font.

enum Palette {
    static let paper     = Color(hex: 0xECEDEB)
    static let surface    = Color(hex: 0xF8F8F6)
    static let surface2   = Color(hex: 0xF2F2F0)

    static let ink        = Color(hex: 0x23222A)
    static let ink2       = Color(hex: 0x5A5860)
    static let ink3       = Color(hex: 0x8F8D94)

    static let line       = Color(hex: 0xE2E0DA)
    static let line2      = Color(hex: 0xD6D4CD)

    /// The one warm accent. Use sparingly — the thread node dot, a count tag, focus.
    static let moment     = Color(hex: 0xBD6A37)
    static let momentSoft = Color(hex: 0xD98F5F)

    /// Fire screen only: a flat warm field (never a gradient).
    static let glow       = Color(hex: 0xE7A877)
    static let onGlow     = Color(hex: 0x2B2119)
    static let onGlow2    = Color(hex: 0x6A4A30)
}

enum Corner {
    static let card: CGFloat = 16
    static let button: CGFloat = 11
    static let pill: CGFloat = 999
}

enum Typo {
    static let displayFamily = "ShipporiMincho-Medium"
    static let displayBoldFamily = "ShipporiMincho-Bold"
    static let uiFamily = "IBMPlexSansJP-Regular"
    static let uiMediumFamily = "IBMPlexSansJP-Medium"

    /// Memo text / lead. Mincho.
    static func memo(_ size: CGFloat = 18) -> Font {
        .custom(displayFamily, size: size, relativeTo: .body)
    }
    /// Big fire-screen headline. Mincho bold.
    static func headline(_ size: CGFloat = 40) -> Font {
        .custom(displayBoldFamily, size: size, relativeTo: .largeTitle)
    }
    /// UI chrome / labels.
    static func ui(_ size: CGFloat = 15, weight: Font.Weight = .regular) -> Font {
        .custom(weight == .regular ? uiFamily : uiMediumFamily, size: size, relativeTo: .body)
    }
}

// MARK: - Shared building blocks

/// The signature "thread" motif: a hairline that drops from the memo to its
/// Moment, ending in a warm node dot. Mirrors `.memo__thread` / `.hero-demo` on web.
struct ThreadLine: View {
    var height: CGFloat = 18
    var body: some View {
        Rectangle()
            .fill(Palette.line2)
            .frame(width: 1, height: height)
            .padding(.leading, 3)
            .accessibilityHidden(true)
    }
}

/// Warm node dot placed before a Moment label.
struct MomentDot: View {
    var color: Color = Palette.moment
    var body: some View {
        Circle().fill(color).frame(width: 6, height: 6).accessibilityHidden(true)
    }
}

struct QuietPill: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(Typo.ui(13))
            .foregroundStyle(Palette.ink3)
            .padding(.vertical, 3)
            .padding(.horizontal, 9)
            .overlay(RoundedRectangle(cornerRadius: Corner.pill).stroke(Palette.line, lineWidth: 1))
    }
}

extension View {
    func quietPill() -> some View { modifier(QuietPill()) }

    func cardSurface(_ fill: Color = Palette.surface) -> some View {
        self
            .background(fill)
            .clipShape(RoundedRectangle(cornerRadius: Corner.card))
            .overlay(RoundedRectangle(cornerRadius: Corner.card).stroke(Palette.line, lineWidth: 1))
            .shadow(color: Color.black.opacity(0.05), radius: 8, x: 0, y: 4)
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}
