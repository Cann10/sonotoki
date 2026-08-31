# `ios/App/` — SwiftUI app layer (scaffold, uncompiled)

Sits on top of `../SonotokiKit` (the platform-agnostic core). Written on Windows
with **no Swift/Xcode toolchain**, so **nothing here has been compiled**. Treat it
as a starting point for the Mac session (2026-09-05+), not finished code.

## Wire into Xcode (on the Mac)

1. `cd ios/SonotokiKit && swift test` — get the core green first (fix any port drift).
2. New Xcode project → iOS App, name **Sonotoki**, interface SwiftUI, storage None
   (we add SwiftData by hand), min deployment **iOS 18.0**.
3. Delete the generated `ContentView.swift` / `<name>App.swift`. Add every file
   under `ios/App/Sonotoki/` to the target (keep the folder groups).
4. Add `../SonotokiKit` as a **local Swift package** dependency; link `SonotokiKit`.
5. Bundle fonts and list them in Info.plist `UIAppFonts` (see DesignSystem.swift):
   `ShipporiMincho-{Regular,Medium,SemiBold,Bold}.ttf`,
   `IBMPlexSansJP-{Regular,Medium,SemiBold}.ttf` (Google Fonts, OFL).
6. Info.plist / entitlements:
   - `NSLocationWhenInUseUsageDescription` — 「この場所で思い出すために使います」
   - `UIBackgroundModes` → `location` (only if Phase 0 shows WhenInUse alone is short)
   - `NSLocationAlwaysAndWhenInUseUsageDescription` — only if method (b)/Always is adopted
   - Capability: **Time Sensitive Notifications** (Signing & Capabilities → Push? no —
     it's `com.apple.developer.usernotifications.time-sensitive` entitlement)
   - Background Modes: Location updates (method b), Remote notifications **off**
7. Add a **unit test target**; add `App/Tests/SonotokiStoreTests.swift` to it and
   turn on *Testability* for the Debug build (it uses `@testable import Sonotoki`).
   It runs the whole submit → arm → situation → fire → done/next path against an
   in-memory `ModelContainer` with spy services — no device needed.
8. Build to a **real device** — geofencing and Time-Sensitive delivery don't work
   in the simulator.

## File map

| File | Role | Confidence |
|---|---|---|
| `SonotokiApp.swift` | `@main`, `AppEnvironment` wires container ↔ services ↔ store, cold-launch bootstrap | med |
| `DesignSystem.swift` | palette + type tokens ported from `web/src/index.css`, shared bits (`ThreadLine`, `cardSurface`) | high |
| `Store/Persistence.swift` | SwiftData `@Model` records + value-type mappers (`MomentRecord.toValue()` …) | med |
| `Store/SonotokiStore.swift` | `@Observable` reducer mirroring `web/src/store/useSonotoki.ts` — submit / repick / teachPlace / addRef / removeRef / forgetLabel / remove / markDone / markNext / handleSituation / bootstrapMonitoring | med |
| `Services/NotificationService.swift` | `UNUserNotificationCenter`, category `SONOTOKI_MOMENT` + `[やった]`/`[次のそのとき]` actions, Time-Sensitive fire, calendar backstop | med |
| `Services/LocationService.swift` | `CLMonitor` + `CLServiceSession` (method **b**), token↔condition, 20-slot distance cull, event stream → engine | **low — verify every CLMonitor call on device** |
| `Views/SonotokiMomentView.swift` | the「そのときです。」fire screen, ported from the polished web design | high |
| `Views/RootView.swift` | masthead + input + list; empty-state nudge | med |
| `Views/NoteInputView.swift` | single-field capture | high |
| `Views/MomentListView.swift` | sectioned list + `MomentCardView` (thread motif, tags) | med |
| `Views/InferenceToastView.swift` | inline post-submit confirmation | med |
| `Views/TeachPlaceView.swift` + `PlacePickerView.swift` | "「ジム」ってどこ?" → map pin / current location → `PlaceRef` | low (map interactions untested) |
| `Views/LearnedPlacesView.swift` | Personal Place Dictionary management (1 label → N places), `FlowRow` layout | med |
| `Views/MyPlacesView.swift` | 家/職場 anchor registration + learned places | med |
| `Views/OnboardingView.swift` | 3-beat onboarding, notification permission | med |
| `Tests/SonotokiStoreTests.swift` | store spec: submit → arm → situation → fire → done/next, dict sync, persistence round-trip (in-memory container + spy services) | med |

## Known gaps / TODO on device

- **LocationService method (a)**: plan default is `UNLocationNotificationTrigger` +
  WhenInUse. This scaffold only implements method (b) (`CLMonitor`, app-side engine)
  because the store is built around `handleSituation`. Phase 0 must add an (a) path
  behind a debug toggle and compare fire-rate / latency over a 48h round-trip.
- `CLMonitor` API shape (`events` async sequence, `add(_:identifier:assuming:)`,
  `CircularGeographicCondition`) is written from memory — **check against the SDK**.
- `OneShotLocation.shared` is a stub; wire `LocationService` to push each fix into it
  so "いまいる場所" in the teach flow works without the map.
- Candidate re-pick ("ちがう" / "直す") sheets are TODO — `store.repick(...)` exists.
- Time-bucket rollover: nothing schedules `handleSituation(.time(...))` yet. Add a
  `BGAppRefreshTask` or a local timer that emits `this_evening` / `tomorrow_morning`.
- No focus-trap on the fire `fullScreenCover` beyond `.isModal`; fine for v1.
- 20-slot cull recompute is only wired to auth-change; add SLC (`CLLocationManager`
  `startMonitoringSignificantLocationChanges`) per plan §9.
