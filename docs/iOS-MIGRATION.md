# iOS 移行 — Web版「そのとき」→ SwiftUI v1

> 目的: App Store 公開可能な **v1** を作る。v1.1 機能には広げない。
> 優先順位: **① 通知の信頼性 → ② 入力の簡単さ → ③「次のそのとき」→ ④ 使うほど育つ「いつもの場所」→ ⑤ Privacy → ⑥ UI**
> 承認済み設計は `docs/PLAN-v1.md`。本書はそれを Web 版の実装知見で具体化したもの。

---

## 1. Web版の仕様・状態遷移・データモデル（現状確認）

### 1.1 データモデル（`web/src/domain/types.ts`）

| 型 | 中身 | 役割 |
|---|---|---|
| `SemanticKind` | `place_arrival` / `place_departure` / `home_arrival` / `leave_home` / `work_arrival` / `time` | AI（意味理解）が出す「どんな状況で戻すか」の意味ラベル |
| `Trigger`（primitive） | `place_enter(placeId)` / `place_exit(placeId)` / `time(timeBucket)` | 決定論エンジンが知る唯一の発火条件。3種だけ |
| `PlaceId` | `home` / `work` / `poi:grocery` / `poi:convenience` / `poi:pharmacy` / `named:<任意>` | 場所の識別子 |
| `Moment` | id, originalText, humanLabel, kind, trigger, recurring, lowConfidence, timeBackstop?, state, createdAt, firedCount, lastFiredAt?, **placePhrase?**, **learnedPlace?** | あずけたメモ＝トリガーに武装された1件 |
| `MomentState` | `armed` / `awaiting_next` / `done`（＋エンジンが `fired` / `needs_place` を追加） | 状態機械の状態 |
| `PlaceDict` | `Record<正規化キー, PlaceId[]>` | Personal Place Dictionary。**1呼び方 → 複数場所**（web/iOS とも。§3.2） |
| `WorldState` | `{ location: 'outside' | PlaceId, lastTimeBucket? }` | **シミュレーターの世界**（デモ専用）。iOS では実センサーに置換 |
| `SituationEvent` | `enter` / `exit` / `time` | 状況イベント。Web はボタン、iOS は Core Location / スケジューラ |
| `MomentInterpretation` / `MomentCandidate` | interpreter の出力（confidence 付き候補配列） | AI 層の I/F |

### 1.2 状態遷移（`web/src/domain/engine.ts`）

```
submit(text)
  └─ interpret(text, dict) → MomentCandidate[]（確信度降順）
       ├─ 先頭が「独自の呼び方 かつ 辞書に無い」 → buildLearningMoment
       │     state = needs_place（trigger は仮置き。エンジンは評価しない）
       │       └─ teachPlace(placeId) → resolveLearnedMoment → state = armed
       └─ それ以外 → armMoment（resolve できる候補まで順に試す） → state = armed

armed ──(状況イベントが trigger に一致)──▶ fired          （firedCount++、fireQueue へ）
fired ──[やった]──▶ done
fired ──[次のそのとき]──▶ contextActive ? awaiting_next : armed
awaiting_next ──(イベント適用後に contextActive が false 化＝状況から抜けた)──▶ armed
     ※ 同一イベントで再武装した Moment はその場では発火させない（justRearmed ガード）
```

- `contextActive(trigger, world)`: place系は `world.location === trigger.placeId`、time は `world.lastTimeBucket === bucket`
- `applySituation`: ①ワールド更新 → ②状況を抜けた `awaiting_next` を再武装 → ③`armed` の一致判定で発火
- 複数 Moment が1イベントで同時発火しうる（`fireQueue`）
- `timeBackstop`: 型はあるが **Web エンジンは未強制**（タイマー無し）。iOS で実装する

### 1.3 Personal Place Dictionary（`web/src/domain/placeDictionary.ts`）

- `placeKey(phrase)`: NFKC 正規化 → 小文字化 → 先頭の「その/あの/うちの/いつもの/例の」除去 → 末尾助詞除去
- `lookup / learn / forget / entries`
- **1キー → 1 PlaceId**（今回 iOS で複数対応に拡張する）

### 1.4 AI 層（`web/src/domain/interpreter.ts`）

- `interpret(rawText, dict): MomentInterpretation` — 端末内ルールベースの日本語キーワード解析
- 検出: 購入語 / 在庫切れ語 / 置き忘れ語 / 伝言語 / 期限語 / 組み込み場所（大学・職場）/ 店（スーパー・コンビニ・薬局）/ 時間帯 / **独自の場所の呼び方**（「〜に着いたら」「〜を出る」「〜に忘れた」等の言い回し＋ `NOT_A_PLACE` 除外）
- 辞書照合 → `learnedPlaceId`（解決済み）または `needsPlaceLearning`（一度だけ聞く）
- confidence 降順の `MomentCandidate[]` を返す
- **これが「AI = 意味理解」層**。差し替え可能な adapter の1実装

### 1.5 Resolver（`web/src/domain/resolver.ts`）

- `resolve(candidate) → { ok, trigger } | { ok:false, needsLearning?, phrase? }`
- semantic kind + placeKind/poiCategory/placeLabel/learnedPlaceId → 3 primitive のどれか1つ
- `isSimulatable(placeId)` ゲート（**Web専用**: SIM_PLACES に無い場所は出さない）

### 1.6 ストア／永続化（`web/src/store/useSonotoki.ts`）

- `useReducer`。アクション: submit / repick / teachPlace / forgetPlace / remove / undoLast / dismissToast / sim / done / next / reset
- 永続化: localStorage に `{ moments, world, placeDict }` の JSON

### 1.7 UI（9 コンポーネント）

NoteInput（入力）/ InferenceToast（推論結果・確認・「覚えました/覚えています」）/ MomentList（待機中・次のそのとき待ち・場所を教えて・すんだこと）/ **WorldSim（シミュレーター＝デモ専用）** / **SonotokiMoment（発火オーバーレイ）** / TeachPlace（どこ？）/ LearnedPlaces（覚えた場所）/ Onboarding / ErrorBoundary

---

## 2. iOS 再利用マップ

| Web | iOS v1 | 扱い |
|---|---|---|
| `types.ts` の canonical モデル | `SonotokiKit` の Swift `struct/enum`（`Codable, Sendable`） | **概念そのまま移植**（1:1） |
| `engine.ts`（決定論エンジン＋状態機械） | `TriggerEngine` / `MomentStateMachine`（純 Swift 関数） | **ロジック移植**。XCTest も移植 |
| `resolver.ts` | `Resolver`（Swift） | 移植。`isSimulatable` → 「実座標／実POIカテゴリに解決できるか」に置換 |
| `placeDictionary.ts` | `PlaceDictionary`（SwiftData 永続） | **拡張**: 1ラベル → **複数** `PlaceRef` |
| `interpreter.ts`（ルールベース JP） | `RuleBasedInterpreter`（Swift 移植）＋ `Interpreter` protocol | 移植。将来 on-device LLM に差し替え可能な adapter の1実装 |
| `WorldState` / `SituationEvent` / sim 入力 | **Core Location イベント**（region enter/exit・visit・SLC）＋ 時刻スケジューラ | **作り直し**: sim ボタン → 実センサー。イベント型（enter/exit/time）は同じ |
| `WorldSim` コンポーネント | 無し（任意でデバッグ用「監視中の場所」ビュー） | **廃止**（デモ専用） |
| `SonotokiMoment` オーバーレイ | **Local Notification**（[やった]/[次のそのとき] アクション）＋ アプリ内「そのとき」ビュー | **作り直し** |
| `useSonotoki` reducer | `SonotokiStore`（`@Observable`）＋ 同じアクション群 | ロジック移植、永続化を SwiftData に |
| localStorage JSON | **SwiftData**（`MomentRecord`, `LearnedLabel`, `PlaceRef`）＋ App Group（拡張と共有） | **作り直し** |
| ErrorBoundary | 不要 | 廃止 |
| NoteInput / MomentList / TeachPlace / LearnedPlaces / Onboarding | SwiftUI View に**デザイン踏襲で作り直し** | 作り直し（体験は維持） |

### 新規（iOS のみ）

- Core Location 権限フロー（When In Use →（価値体験後）Always 昇格。承認済みPlan §12）
- `CLServiceSession` + `CLMonitor`（iOS 18+）でリージョン監視、**20枠マネージャ**（RegionScheduler）
- **「必要になった場所だけ登録」**フロー: `teachPlace` 時に「いま ここ / 地図でピン / 既存の"いつもの"に追加」
- **1ラベル → 複数場所**: `LearnedLabel("スーパー") → [PlaceRef, PlaceRef, …]`。いずれか1つに enter で発火
- Local Notification スケジューリング＋通知アクションハンドラ
- 端末再起動後の監視復元（Bootstrap）
- 時間バックストップの実タイマー（`UNCalendarNotificationTrigger`）
- App Store メタ（位置利用目的、プライバシーラベル）

---

## 3. iOS v1 設計

### 3.1 モジュール構成

```
ios/
  SonotokiKit/            SPM ローカルパッケージ。UIKit/SwiftUI 非依存の純ロジック。
    Sources/SonotokiKit/  Models / PlaceDictionary / Resolver / TriggerEngine / Interpreter
    Tests/SonotokiKitTests/  XCTest（Web の 57 テストを移植）
  Sonotoki/               app target（SwiftUI）。SonotokiKit に依存。
    App / Store / Location / Notifications / Views / Onboarding
  Sonotoki.xcodeproj      ※ Mac の Xcode で作成（SonotokiKit をローカル依存に追加）
```

承認済みPlan §改訂3「core は FoundationModels 非依存」を踏襲。`SonotokiKit` が canonical。最低 **iOS 18**。

### 3.2 データモデル変更 — 1ラベル → 複数場所

```swift
// ユーザーの呼び方（「スーパー」「ジム」「実家」…）
@Model final class LearnedLabel {
  var key: String            // 正規化キー（placeKey 相当、ユニーク）
  var displayName: String
  var refs: [PlaceRef]        // 複数可（スーパー → 複数店舗）
  var createdAt: Date
}

@Model final class PlaceRef {
  var nickname: String?       // 「駅前の店」「実家の近くの」
  var kind: PlaceRefKind      // .coordinate / .poiCategory / .anchor
  var latitude: Double?
  var longitude: Double?
  var radius: Double          // m（既定 120、Reduced accuracy 時 拡大）
  var poiCategoryRaw: String? // MKPointOfInterestCategory の rawValue
  var anchorRaw: String?      // "home" / "work"
  var createdAt: Date
}

enum PlaceRefKind: String, Codable { case coordinate, poiCategory, anchor }
```

`Trigger` の場所参照は「ラベル参照」に：

```swift
enum Trigger: Codable, Sendable, Equatable {
  case placeEnter(PlaceTarget)
  case placeExit(PlaceTarget)
  case time(TimeBucket)
}
enum PlaceTarget: Codable, Sendable, Equatable, Hashable {
  case anchor(Anchor)         // .home / .work
  case label(String)          // LearnedLabel.key（1..N refs）— Moment が保持するのはこれ
  case region(token: String)  // 展開後の1地点（expandTriggers の出力）
}

// Resolver が semantic を「登録済みの複数」に展開する（web の expandPlaceIds / expandTriggers と同一構造）
func expandRegionTokens(_ target: PlaceTarget, dictionary: PlaceDictionary) -> [String]
func expandTriggers(_ trigger: Trigger, dictionary: PlaceDictionary) -> [Trigger]
```

**Moment は semantic な `.label(key)` だけ保持**。`Resolver.expandRegionTokens` が、いま登録されている
`PlaceRef` の CL リージョン token 群（`"label:<key>:<refID>"`）に展開する。CLMonitor の条件はこの結果で登録。

**発火判定（決定論）**: `placeEnter(.label("スーパー"))` は、その label の **いずれかの `PlaceRef`** に enter したら成立。`contextActive` は「現在地がその label の ref のどれかの中」。`PlaceTarget.matches(token:)` で照合（label は prefix、region は exact）。

**初回に全部登録させない**: 「スーパー」系メモ初出 → `needs_place` → 「どこ？」で **1店だけ**登録して arm。次に「スーパー」系メモ → 既存 label にヒット、**聞かない**。別店でも鳴らしたくなったら「"スーパー"に店を足す」動線（LearnedLabel 画面 or 発火通知の「別の場所でも」）。

### 3.3 Core Location 戦略（優先度①）

- 権限: 初回起動では要求しない。**最初の位置 Moment 作成時**に When In Use → 直後に「開いていなくても知らせるには"常に許可"」で Always 昇格（スキップ可）
- `CLServiceSession` + `CLMonitor`（iOS 18+）で `CLMonitor.CircularGeographicCondition` を監視
- **RegionScheduler（20枠）**: 全 armed Moment の `PlaceRef` を「現在地／home／work からの距離 × 直近作成」でスコア、上位 ~18 を実監視、残りは dormant。`CLVisit` / Significant Location Change で再計算（枠を消費しないメタトリガ）
- カテゴリ的な場所（スーパー全般）は **v1 ではユーザー登録の実店舗（複数可）のみ**監視。「世界中の任意の店」は v1 でやらない（承認済みPlan）
- Precise Location off → 半径 500m+ に拡大し設定で告知
- **発火 → 通知**: CL イベント受信 → `UNTimeIntervalNotificationTrigger`(1s) で即ローカル通知（`UNLocationNotificationTrigger` は制御が弱く枠を食うので使わない）
- 時刻 Moment / 時間バックストップ: `UNCalendarNotificationTrigger`
- **端末再起動**: 起動時に SwiftData の armed Moment から監視を再構築（Bootstrap）

### 3.4 通知（優先度①）

- `UNNotificationCategory` `"SONOTOKI_MOMENT"` ＋ actions:
  - `DONE`（やった）→ Moment を done、監視解除・枠開放
  - `NEXT`（次のそのとき）→ `contextActive ? awaiting_next : armed`、再アーム。**時間スヌーズではない**
- タイトル = メモ原文 / 本文 = 「そのとき：いま{ラベル}の近くです」/ interruption level = `.timeSensitive`（要 entitlement、「明示的に待つリマインダーの実成立時のみ」）
- 通知アクション → `UNUserNotificationCenterDelegate` でハンドル、状態遷移は `SonotokiKit` の決定論エンジンに委譲、監視を再アーム
- オンボーディング: 通知許可のみ必須。`.provisional` でハードルを下げてから明示許可へ

### 3.5 AI（意味理解）と決定論の分離（優先度⑤ Privacy）

- **AI がやること**: 自然文 → `MomentInterpretation`（意味ラベル・確信度・独自呼び方の抽出）だけ
- **決定論がやること**: 場所解決（Resolver）、発火判定・再アーム・20枠・通知（TriggerEngine）
- v1 の Interpreter = 端末内 `RuleBasedInterpreter`（Web からの移植）。**クラウド送信ゼロ**
- 将来: `FoundationModelsInterpreter`（iOS 26+ / Apple Intelligence 機種）を同じ `Interpreter` protocol の別実装として（v1.1）
- **GPS 履歴・生活圏の生データは端末外に出さない**。アカウント不要。プライバシーラベル「データ収集なし」

### 3.6 状態機械（Web と同一・移植）

`armed / awaiting_next / done`（＋ runtime `fired` / `needs_place`）。遷移・`justRearmed` ガード・`fireQueue` は §1.2 のまま Swift に移植。差分は「イベントの出所」が sim ではなく Core Location / スケジューラである点のみ。

### 3.7 主要画面（優先度⑥、Web の体験を維持）

1. **ホーム** — 起動時に入力欄フォーカス ＋ そのとき一覧（待機中／次のそのとき待ち／場所を教えて／すんだこと）
2. **推論結果** — confidence 分岐（≥0.75 無確認＋取り消し可 / 中 1タップ確認 / 低 3択）。ブロックしない
3. **どこ？（TeachPlace）** — 「いま ここ」「地図でピン」「既存の"いつもの"に追加」。1つ選んで arm
4. **いつもの場所** — `LearnedLabel` 一覧。ラベルごとに複数 `PlaceRef`、追加・忘れる
5. **そのとき（発火）** — 通知（[やった]/[次のそのとき]）＋ アプリ内でも同アクション。全画面アンバー
6. **設定** — 権限状態と意味、監視中の場所の可視化、時間バックストップ既定、データ全削除
7. **オンボーディング** — 3枚（コンセプト → その場で1件 → 通知許可）。位置は必要時

### 3.8 永続化

- SwiftData: `MomentRecord`, `LearnedLabel`, `PlaceRef`, `AppSettings`
- App Group（`group.<bundle>.shared`）に SwiftData ストアを置き、通知アクション処理（アプリ本体で処理する前提なら不要だが、将来の拡張のため）
- 旧 Web データの移行は不要（別プラットフォーム）

### 3.9 App Store v1 チェックリスト（提出直前に人間確認）

- `NSLocationWhenInUseUsageDescription` / `NSLocationAlwaysAndWhenInUseUsageDescription`（用途具体）
- `UIBackgroundModes`: `location`（必要な場合のみ）
- Time Sensitive Notifications entitlement の申請と正当性説明
- プライバシーマニフェスト（`PrivacyInfo.xcprivacy`）: データ収集なし・トラッキングなし
- 位置情報の常時利用に対する審査説明文
- スクリーンショット、App 説明（省電力設計・端末内処理を明記）

---

## 4. 進め方（Agent Team）

設計 → SwiftUI 実装 → **ビルド → テスト → 実機検証** → レビュー → 修正。

**環境**: 本作業マシンは Windows で **Swift ツールチェーン・Xcode 無し**。`xcodebuild` / `swift build` / シミュレータ / 実機検証は **macOS + Xcode + iPhone が必須**（承認済みPlan: Mac は 2026-09-05 以降）。

**Windows で今できる（未コンパイル・Xcode 準備完了状態）**:
- 本書（分析＋設計）✓
- `SonotokiKit` の Swift ソース（Models / PlaceDictionary〔複数場所〕/ Resolver / TriggerEngine / RuleBasedInterpreter）— 実証済み TS ロジックの移植
- `SonotokiKitTests`（Web の 57 テストの移植）
- `Package.swift`（`SonotokiKit` は SPM パッケージ＝ Mac で `swift test` 可能、Xcode がそのまま開ける）
- SwiftUI アプリ層（Store / Location / Notifications / Views）のソース
- `Info.plist` キー・entitlements・App Store メタのチェックリスト

**Mac（2026-09-05〜）でやる**: `xcodeproj` 作成、`swift test` / `xcodebuild`、シミュレータ、実機で「アプリ kill 状態 → リージョン enter → 通知」「[次のそのとき] 再アーム」「20枠入替」「再起動後 Bootstrap」の検証、修正。

**Web版**: Heroes League 用デモとして現状維持（このリポジトリの `web/`）。
