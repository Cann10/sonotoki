# そのとき — iOS (SwiftUI, min iOS 18)

Web版（`../web/`）のコア体験を iOS ネイティブへ。設計は `../docs/iOS-MIGRATION.md`。

## 現状（2026-08-31）

`SonotokiKit`（コア）は **Docker の Swift Linux イメージで検証済み** — `swift build` 通過、
**XCTest 51件 全 pass**（`SonotokiKit/test-linux.sh`、要 Docker Desktop 起動）。
`App/`（SwiftData / SwiftUI / CoreLocation / UserNotifications）は Apple フレームワーク
依存のため **Windows/Linux では検証不可 → Mac（2026-09-05 以降）**。

| 済 | 内容 |
|---|---|
| ✅ | 設計・Web版分析（`../docs/iOS-MIGRATION.md`） |
| ✅ | `SonotokiKit/` — コアロジックの Swift 移植。**Linux で `swift build` 通過**（バグ2件修正: Package.swift の tools-version 5.10→6.0、Resolver.swift の三項演算子の型推論） |
| ✅ | `SonotokiKit/Tests/` — **XCTest 51件 Linux で全 pass**（`./test-linux.sh`）。engine に armMoment 系5件を追補し web と対応 |
| 🟡 | `App/Tests/SonotokiStoreTests.swift` — ストアの spec（submit→arm→situation→fire→done/next、辞書同期、永続化往復）。in-memory container + spy。**Xcode のテストターゲットに追加して実行** |
| 🟡 | `App/` — SwiftUI アプリ層の**足場**（Store / Services / Views、**未コンパイル**）。詳細と Xcode 手順は `App/README.md` |
| 🟡 | Core Location（`App/Services/LocationService.swift` = 方式(b) `CLMonitor` の骨組み。**実機で全 API 要検証**、方式(a)は Phase 0 で追加） |
| 🟡 | Local Notifications（`App/Services/NotificationService.swift` = カテゴリ + [やった]/[次のそのとき] + Time-Sensitive + 時間バックストップ） |
| 🟡 | SwiftData 永続化（`App/Store/Persistence.swift` = `MomentRecord` / `LearnedLabelRecord` / `PlaceRefRecord` / `AnchorRecord` / `EventRecord` / `AppStateRecord` + 値型マッパ） |
| ⏳ | Xcode プロジェクト（`Sonotoki.xcodeproj`）— Mac で作成（`App/README.md` の手順） |
| ⏳ | フォント同梱（Shippori Mincho / IBM Plex Sans JP）、Info.plist 権限文言、Time Sensitive entitlement |
| ⏳ | 候補差し替え（ちがう/直す）シート、時間帯ロールオーバー、SLC による20枠再計算、方式(a)比較 |

## `SonotokiKit`（SPM ローカルパッケージ）

UIKit/SwiftUI/CoreLocation 非依存。`Codable` / `Sendable` の値型のみ。
Web の `web/src/domain/` を移植したもの。**canonical**。

| ファイル | Web の対応 | 役割 |
|---|---|---|
| `Models.swift` | `types.ts` | `SemanticKind` / `Trigger` / `PlaceTarget` / `Moment` / `MomentCandidate` / `WorldSnapshot` / `SituationEvent` |
| `PlaceDictionary.swift` | `placeDictionary.ts` | `placeKey` 正規化。**1ラベル → 複数 `PlaceRef`**（スーパー → 複数店舗）。learn / addRef / removeRef / forget |
| `Resolver.swift` | `resolver.ts` | semantic Moment → 3 primitive。anchor / 辞書ラベル / needsLearning |
| `TriggerEngine.swift` | `engine.ts` | 状態機械（armed→fired→done/awaitingNext）。`applySituation` / `markDone` / `markNext` / `armMoment` / `buildLearningMoment` / `resolveLearnedMoment` |
| `RuleBasedInterpreter.swift` | `interpreter.ts` | 端末内ルールベース日本語解析（`Interpreter` protocol の v1 実装） |

### Web版との対応（1ラベル → 複数場所は両方同じ構造）

| 概念 | Web (`web/src/domain`) | iOS (`SonotokiKit`) |
|---|---|---|
| 辞書 | `PlaceDict = Record<placeKey, PlaceId[]>` | `PlaceDictionary`（`key → LearnedLabel.refs: [PlaceRef]`） |
| Moment が持つ場所 | semantic `Trigger.ref = { kind:'label', key }` | semantic `Trigger` = `.placeEnter(.label(key))` |
| 展開 | `expandPlaceIds(ref, dict)` / `expandTriggers(trigger, dict)` | `expandRegionTokens(target, dict)` / `expandTriggers(trigger, dict)` |
| 発火判定 | `expandPlaceIds(...).includes(event.placeId)` | `PlaceTarget.matches(token:)`（label は prefix、region は exact） |
| 展開後の1地点 | `PlaceRef { kind:'place', placeId }` | `PlaceTarget.region(token:)` |

- **リージョン token**: `"anchor:home"` / `"anchor:work"` / `"label:<key>:<refID>"`。CLMonitor の条件は
  `expandRegionTokens` の結果で登録する。
- **World**: Web の `WorldState.location`（単一）→ `WorldSnapshot.insideTokens`（重なり得る複数）。
- **組み込みの場所**: 「大学/スーパー/コンビニ/薬局」は学習ラベル（Web は既定シード、iOS は初回に登録）。
  「会社/職場/出社」は `work` アンカー。

## Mac 以外での検証（コアのみ）

`SonotokiKit` は Foundation 値型だけなので、Docker の Swift Linux イメージで
`swift build` / `swift test` が回る（`App/` は Apple フレームワーク依存で不可）。

```bash
cd ios/SonotokiKit
./test-linux.sh          # Docker Desktop 起動が前提。swift test（51件）
./test-linux.sh build    # ビルドのみ
```

## Mac での開始手順（2026-09-05〜）

```bash
cd ios/SonotokiKit
swift test            # まず SonotokiKit のテストを通す（Linux で 51件 pass 済み）
```

その後 **`App/README.md`** の手順で Xcode に `App/Sonotoki/` の足場を取り込む
（`Sonotoki` ターゲット作成 → 全ファイル追加 → `SonotokiKit` をローカルパッケージ依存に →
フォント同梱 → Info.plist 権限 → 実機ビルド）。まず compile を通し、次に
`LocationService`（方式b `CLMonitor`）の各 API を実機で検証、その上で Phase 0
（方式a との48h比較 / §14ゲート A–G）へ。
