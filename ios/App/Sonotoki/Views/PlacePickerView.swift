import SwiftUI
import MapKit
import CoreLocation

/// Drop a pin for a place. Plan §11: when registering a category place ("あなたの
/// スーパー"), offer nearby POIs via MKLocalPointsOfInterestRequest to cut friction.
/// This scaffold does the map-pin path; the POI-suggestion list is a TODO.
struct PlacePickerView: View {
    /// (centre, radius-in-metres)
    var onConfirm: (CLLocationCoordinate2D, CLLocationDistance) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var position: MapCameraPosition = .automatic
    @State private var pin: CLLocationCoordinate2D?
    @State private var radius: CLLocationDistance = 120

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                MapReader { proxy in
                    Map(position: $position) {
                        if let pin {
                            Marker("ここ", coordinate: pin).tint(Palette.moment)
                            MapCircle(center: pin, radius: radius)
                                .foregroundStyle(Palette.moment.opacity(0.12))
                                .stroke(Palette.moment.opacity(0.5), lineWidth: 1)
                        }
                    }
                    .onTapGesture { screenPoint in
                        if let coord = proxy.convert(screenPoint, from: .local) {
                            pin = coord
                        }
                    }
                }

                VStack(spacing: 12) {
                    if pin != nil {
                        HStack {
                            Text("半径").font(Typo.ui(13)).foregroundStyle(Palette.ink2)
                            Slider(value: $radius, in: 80...300, step: 20)
                            Text("\(Int(radius)) m").font(Typo.ui(13)).monospacedDigit()
                        }
                    }
                    Button("この場所にする") {
                        if let pin { onConfirm(pin, radius); dismiss() }
                    }
                    .font(Typo.ui(16, weight: .medium))
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(pin == nil ? Palette.surface2 : Palette.ink)
                    .foregroundStyle(pin == nil ? Palette.ink3 : Palette.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Corner.button))
                    .disabled(pin == nil)
                }
                .padding(16)
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: Corner.card))
                .padding(16)
            }
            .navigationTitle("場所を選ぶ")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("やめる") { dismiss() }
                }
            }
        }
    }
}
