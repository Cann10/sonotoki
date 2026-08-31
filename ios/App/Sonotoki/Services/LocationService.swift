import Foundation
import CoreLocation
import SonotokiKit

// Core Location monitoring for place triggers.
//
// Plan §11 / §15: v1 target is **When In Use only**. Phase 0 must measure two
// approaches on-device and pick per Moment kind:
//   (a) UNLocationNotificationTrigger + WhenInUse   ← plan default, but the OS
//       fires the notification directly; app reconciles state on next launch.
//   (b) CLMonitor + CLServiceSession (+ Always)     ← app gets a callback, runs
//       the deterministic engine, then posts the notification itself.
//
// This file implements (b) because the whole app is built around an app-side
// engine (`SonotokiStore.handleSituation`). A Phase-0 spike should add an (a)
// path behind a debug toggle and compare fire-rate / latency (see 48h log).
//
// 20-condition ceiling: simple distance culling only (plan §9). home/work always
// kept; the rest are the nearest by straight-line distance. Recompute on
// significant-location-change only.

protocol LocationMonitoring: AnyObject {
    /// Fully-resolved conditions for one Moment (already expanded to per-ref regions
    /// with real coordinates by the store).
    func monitor(momentID: String, conditions: [ResolvedCondition])
    func stopMonitoring(momentID: String)
    func stopAll()
    /// Requests When In Use if not yet decided.
    func requestWhenInUseIfNeeded()
}

/// A concrete geofence to watch: a CL region token, its centre, radius, and edge.
struct ResolvedCondition: Hashable {
    enum Edge { case enter, exit }
    var token: String            // "anchor:home" | "label:<key>:<refID>"
    var center: CLLocationCoordinate2D
    var radius: CLLocationDistance
    var edge: Edge

    static func == (l: ResolvedCondition, r: ResolvedCondition) -> Bool {
        l.token == r.token && l.edge == r.edge
    }
    func hash(into h: inout Hasher) { h.combine(token); h.combine(edge == .enter) }
}

@MainActor
final class LocationService: NSObject, LocationMonitoring {

    /// Wired by the app to `store.handleSituation`.
    var onSituation: ((SituationEvent) -> Void)?

    private let manager = CLLocationManager()
    private var session: CLServiceSession?
    private var monitor: CLMonitor?
    private let monitorName = "sonotoki.monitor"

    /// momentID → the conditions it asked for (so we can cull / restore).
    private var wanted: [String: Set<ResolvedCondition>] = [:]

    private let maxConditions = 20

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func requestWhenInUseIfNeeded() {
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
    }

    // MARK: - Monitoring lifecycle

    func monitor(momentID: String, conditions: [ResolvedCondition]) {
        wanted[momentID] = Set(conditions)
        Task { await reconcile() }
    }

    func stopMonitoring(momentID: String) {
        wanted[momentID] = nil
        Task { await reconcile() }
    }

    func stopAll() {
        wanted.removeAll()
        Task { await reconcile() }
    }

    /// Bring the live CLMonitor condition set in line with `wanted`, applying the
    /// 20-slot cull. Idempotent — safe to call after any change or a cold launch.
    private func reconcile() async {
        let monitor = await ensureMonitor()
        ensureSession()

        let selected = cull(Array(Set(wanted.values.flatMap { $0 })))
        let selectedTokens = Set(selected.map(\.identifierString))

        // Remove conditions no longer selected.
        for id in await monitor.identifiers where !selectedTokens.contains(id) {
            await monitor.remove(id)
        }
        // Add newly selected conditions.
        let existing = Set(await monitor.identifiers)
        for c in selected where !existing.contains(c.identifierString) {
            let region = CLMonitor.CircularGeographicCondition(
                center: c.center, radius: c.radius
            )
            await monitor.add(region, identifier: c.identifierString, assuming: .unsatisfied)
        }
    }

    private func ensureMonitor() async -> CLMonitor {
        if let monitor { return monitor }
        let m = await CLMonitor(monitorName)
        monitor = m
        Task { await consumeEvents(from: m) }
        return m
    }

    private func ensureSession() {
        // Keeps background delivery alive (plan risk #11). WhenInUse first.
        if session == nil {
            session = CLServiceSession(authorization: .whenInUse)
        }
    }

    private func consumeEvents(from monitor: CLMonitor) async {
        do {
            for try await event in await monitor.events {
                guard let (token, edge) = Self.decode(identifier: event.identifier) else { continue }
                let becameInside = event.state == .satisfied
                switch (edge, becameInside) {
                case (.enter, true):  onSituation?(.enter(token: token))
                case (.exit, false):  onSituation?(.exit(token: token))
                default: break
                }
            }
        } catch {
            // A dropped stream: rebuild on next reconcile.
            self.monitor = nil
        }
    }

    // MARK: - 20-slot cull (plan §9: simple distance only)

    private func cull(_ all: [ResolvedCondition]) -> [ResolvedCondition] {
        guard all.count > maxConditions else { return all }
        let here = manager.location?.coordinate
        let anchors = all.filter { $0.token.hasPrefix("anchor:") }
        let rest = all.filter { !$0.token.hasPrefix("anchor:") }
        let sorted = rest.sorted { a, b in
            guard let here else { return false }
            return here.distance(to: a.center) < here.distance(to: b.center)
        }
        return Array((anchors + sorted).prefix(maxConditions))
    }

    // MARK: - token <-> CLMonitor identifier

    private static func decode(identifier: String) -> (token: String, edge: ResolvedCondition.Edge)? {
        // identifier == "<token>#enter" / "<token>#exit"
        guard let hash = identifier.lastIndex(of: "#") else { return nil }
        let token = String(identifier[..<hash])
        let edge = identifier[identifier.index(after: hash)...] == "enter"
            ? ResolvedCondition.Edge.enter : .exit
        return (token, edge)
    }
}

private extension ResolvedCondition {
    var identifierString: String { "\(token)#\(edge == .enter ? "enter" : "exit")" }
}

private extension CLLocationCoordinate2D {
    func distance(to other: CLLocationCoordinate2D) -> CLLocationDistance {
        CLLocation(latitude: latitude, longitude: longitude)
            .distance(from: CLLocation(latitude: other.latitude, longitude: other.longitude))
    }
}

extension LocationService: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            if manager.authorizationStatus == .authorizedWhenInUse
                || manager.authorizationStatus == .authorizedAlways {
                await reconcile()
            }
        }
    }
}
