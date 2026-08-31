import SwiftUI
import CoreLocation
import SonotokiKit

/// "「ジム」ってどこ? 一度だけ教えてください。" — binds a phrase to a real place.
/// Web picks from simulator places; on device we bind to a coordinate (current
/// location now, or a map pin). After this, the phrase resolves with no prompt.
struct TeachPlaceView: View {
    let phrase: String
    var onPick: (PlaceRef) -> Void

    @State private var showMap = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("「\(phrase)」ってどこ? 一度だけ教えてください。")
                .font(Typo.ui(13))
                .foregroundStyle(Palette.ink2)

            HStack(spacing: 8) {
                Button("いまいる場所") { useCurrentLocation() }
                    .buttonStyle(TeachChip())
                Button("地図で選ぶ") { showMap = true }
                    .buttonStyle(TeachChip())
            }
        }
        .sheet(isPresented: $showMap) {
            PlacePickerView { coordinate, radius in
                onPick(.at(coordinate.latitude, coordinate.longitude, radius: radius))
            }
        }
    }

    private func useCurrentLocation() {
        // TODO(Mac): read CLLocationManager.location (WhenInUse). Placeholder keeps
        // the flow wired; PlacePickerView is the reliable path until then.
        guard let c = OneShotLocation.shared.lastKnown else { showMap = true; return }
        onPick(.at(c.latitude, c.longitude, radius: 120))
    }
}

private struct TeachChip: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Typo.ui(14))
            .foregroundStyle(Palette.ink)
            .padding(.vertical, 8).padding(.horizontal, 14)
            .background(Palette.surface2)
            .clipShape(Capsule())
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// Minimal shared holder for a last-known fix, filled by LocationService.
/// TODO(Mac): wire LocationService to update this on each fix.
final class OneShotLocation {
    static let shared = OneShotLocation()
    var lastKnown: CLLocationCoordinate2D?
}
