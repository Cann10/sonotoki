# そのとき — iOS (SwiftUI, min iOS 18)

Web版（`../web/`）のコア体験を iOS ネイティブへ。設計は `../docs/iOS-MIGRATION.md`。

## 現状（2026-08-31）

作業マシンが **Windows で Xcode / Swift ツールチェーン無し**のため、
**コンパイル・シミュレータ・実機検証はしていない**。Mac（2026-09-05 以降）で行う。

| 済 | 内容 |
|---|---|
| ✅ | 設計・Web版分析（`../docs/iOS-MIGRATION.md`） |
| ✅ | `SonotokiKit/` — プラットフォーム非依存のコアロジックを Swift へ移植（**未コンパイル**） |
| ✅ | `SonotokiKit/Tests/` — Web の 57 テストの移植（**未実行**） |
| ⏳ | Xcode プロジェクト（`Sonotoki.xcodeproj`）— Mac で作成 |
| ⏳ | SwiftUI アプリ層 — Store / LocationManager / NotificationManager / Views |
| ⏳ | Core Location（`CLServiceSession` + `CLMonitor`、20枠、Bootstrap） |
| ⏳ | Local Notifications（[やった]/[次のそのとき] アクション） |
| ⏳ | SwiftData 永続化（`MomentRecord` / `LearnedLabel` / `PlaceRef`） |

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

### Web版との主な差分

- **場所の表現**: Web の単一 `PlaceId` → iOS は `PlaceTarget`（`.anchor(home/work)` または `.label(key)`）。
  1 ラベルに複数の実 `PlaceRef` が紐づき、そのどれか一つに enter/exit で成立。
- **リージョン token**: Core Location のリージョン識別子を `"anchor:home"` / `"label:<key>:<refID>"` で符号化。
  `PlaceTarget.matches(token:)` で決定論的に照合。
- **World**: Web の `WorldState.location`（単一）→ `WorldSnapshot.insideTokens`（重なり得る複数）。
- **組み込みの場所**: 「大学」も学習ラベル（初回に登録）。「会社/職場/出社」は `work` アンカー。

## Mac での開始手順（2026-09-05〜）

```bash
cd ios/SonotokiKit
swift test            # まず SonotokiKit のテストを通す（移植のズレを潰す）
```

その後 Xcode で `Sonotoki` アプリターゲットを作成し、`SonotokiKit` をローカルパッケージ依存に追加。
`../docs/iOS-MIGRATION.md` §3 の順で Store → Location → Notifications → Views。
