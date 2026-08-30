# 「そのとき」 v1 設計Plan（Agent Team成果 / 設計のみ・ユーザーレビュー反映版）

> ステータス: **設計のみ**。実装・ファイル変更・依存追加は未着手。承認後に §16 から着手する。

## Context

「覚えておかなくていいメモ」。ユーザーは *何を* 思い出したいかだけを一言入力し、AIが *いつ/どこで*
返すか（= **Moment**）を推論する。既存リマインダーが定着しない理由は「メモを書くこと」ではなく
「想起トリガーを自分で設計・入力する手間」にある、という仮説。そのとき固有価値は
**トリガー設計をユーザーにさせないこと** と、通知の **[次のそのとき]**（時間スヌーズではなく、
同じMomentが次に成立したら再通知）。

Agent Team（Product / iOS Engineer / UX / AI・Architecture / Red Team）で並列検討し、相互レビュー →
Leadが対立点を裁定 → 機能削減 → Red Teamが最終批判 → ユーザーレビュー反映、が本Plan。
判断優先順位: **①そのとき固有価値 → ②iOS上の信頼性 → ③UXの単純さ → ④Privacy → ⑤App Store実現性**。

技術前提（調査で確認済み）:
- `UNLocationNotificationTrigger` は内部で `CLRegion` を使う。登録自体は `When In Use` でも可能だが、
  **アプリ非前面・終了時の発火信頼性は Phase 0 で実測して判断する**（Apple公式は保証範囲を明示していない）。
- 地理条件のバックグラウンド監視を確実にするには `CLMonitor` + `CLServiceSession`（iOS 18+）+ `Always` が必要。
  同時条件は依然 **20件上限**。
- Apple Foundation Models（iOS 26+, オンデバイス ~3Bモデル, Apple Intelligence 対応機種限定）は `@Generable` で
  構造化出力・オフライン・APIコストゼロ・データ非送信。
- Apple Reminders の位置リマインダーは「住所を明示指定」「到着/退出の二択」のみ。自然文推論・カテゴリ的場所・
  繰り返し文脈の再武装は無い。

### Leadの裁定（役割間で割れた点）
1. **デプロイターゲット**: min **iOS 18**。Foundation Models は対応端末のみのadapterとして分離（下記改訂3）。
   iOS 26 単独案は ⑤App Store実現性とTAM（Red Teamリスク#1）で却下。
2. **`category_place`（次にスーパー）のv1範囲**: 「あなたのスーパー」を初回1回だけ登録（周辺POI候補提示 or
   地図1タップ）→ 以後 `place_arrival`（named）として扱う。複数同種店の自動網羅は **v1.1**。

### ユーザーレビュー後の改訂（本版で反映済み）
1. **位置権限は WhenInUse ファースト**。`CLMonitor + Always` を最初から前提にしない。Phase 0 で
   `UNLocationNotificationTrigger + WhenInUse` と `CLMonitor + Always` を比較し、**WhenInUse だけでコア体験
   （到着/退出通知）が成立するなら v1 では Always を要求しない**。Always は不足時のみ、または LATER のオプトイン。
2. **Moment と Trigger を分離**。ユーザー向け Moment は6種のまま。内部 Trigger primitive を
   **`time` / `place_enter` / `place_exit`** の3種に単純化。帰宅/出社/次に外出/named_place/カテゴリ は
   *semantic context* として扱い、Resolve 段でこの3 primitive に落とす。
3. **Foundation Models を adapter として分離**。core domain は Foundation Models / `@Generable` に依存させない。
   Canonical な AI Structured Output は **OS非依存の `Codable` & `Sendable` モデル**として定義。
   `@Generable` DTO は adapter 内部だけに存在し、canonical モデルへ写像する。
4. **20枠**: 制限への対応設計は維持しつつ、v1 で高度な slot ranking を過剰実装しない
   （v1 = 距離ベースの単純カリング。active 条件が20以下なら退避ロジックは動かさない）。
5. **時間バックストップ**: 全位置Momentへ自動付与しない。**ユーザー入力から期限性が読み取れる場合**
   （締切語・「なくなりそう」等の枯渇示唆・時間窓が抽出できた場合）、**低confidenceで時間フォールバックを
   主にした場合**、または **ユーザーが編集シートで明示追加した場合** に限定。

---

## 1. Product Thesis

そのときは *タスク管理* ではなく **「意図の文脈インボックス」**。頭に浮かんだ用事を、想起条件を考えずに
一言放り込むと、AIが現実世界のMomentに束ね、その場面が来たときだけ戻す。競争軸は「入力の速さ」ではなく
**「トリガーをユーザーが設計しないで済むこと」＋「次のそのとき（繰り返し文脈での再武装）」**。

## 2. Target User

- **A: うっかり生活者（主対象）** — 20〜40代の会社員/学生・共働き親。買い物・持ち物・ちょっとした連絡を
  頻繁に忘れる。Reminders は「毎回場所を選ぶのが面倒」で使っていない。ADHD傾向を含む。
- **B: メモ魔だが見返さない人** — Appleメモや LINE の自分トークに「牛乳」と書いてそのまま忘れる層。

地域: 日本先行。端末: オンデバイスAIの主対象は Apple Intelligence 対応 iPhone。非対応端末・オフラインは
決定論フォールバック（登録地名＋時刻語）で最低限成立させる（min iOS 18）。

## 3. 競合との差

| | Reminders | Todoist / TickTick | そのとき |
|---|---|---|---|
| 自然文からトリガー推論 | ✕（住所を明示指定） | △（明示的な日時/場所名まで） | ○（曖昧文 →「大学から帰るとき」等） |
| カテゴリ的場所（スーパー/薬局） | ✕ | ✕ | △ v1=1回だけ実店舗を登録 / ○ v1.1=一般化 |
| 退出・帰宅・出社の文脈 | △（退出のみ） | ✕ | ○ |
| 繰り返し文脈の再武装 | ✕ | ✕ | ○「次のそのとき」 |
| 想起条件の設計をユーザーがする | 必須 | ほぼ必須 | **不要** |

- 位置精度・通知信頼性の *土台* は同じ Core Location / UNNotification なので差にならない（＝弱点。期待値管理が必須）。
- 負けるポイント: OS同梱・無料・信頼の蓄積、位置リマインダー利用者が元々少数（小TAM）、
  命中率が低いと1事故でアンインストール、AIが1回変な解釈をすると「自分で設定したほうが速い」に戻られる。

## 4. Killer Use Case 上位5

1. 「牛乳なくなりそう」→ 次にスーパー/コンビニに着いたとき
2. 「傘、大学に置いてきた」→ 次に大学を出るとき（退出。重要語は＋次に着いたとき の両建て）
3. 「帰りにゴミ袋買う」→ 今日帰宅するとき / 帰宅導線上の店に着いたとき
4. 「会社で◯◯さんに資料の件を伝える」→ 次に出社したとき（職場到着）
5. 「週末どこか出かけたら〇〇を見る」→ 次に外出したとき（自宅からの退出）

## 5. v1 MUST / LATER / NOT BUILD

**MUST（v1）**
- 単一テキスト入力 →（オンデバイス/決定論）Moment推論 → 自動arm（取消可）。保存は必ず即完了（オフラインでも）
- ユーザー向け Moment 6種: 到着 / 退出 / 帰宅 / 出社 / 次に外出（自宅退出）/ 日時
- 内部 Trigger primitive 3種: `time` / `place_enter` / `place_exit`（§8）
- 通知アクション [やった] / [次のそのとき]（クールダウン付き再武装）
- そのとき一覧（待機中 / 繰り返し中 / 棚上げ / 完了）、Moment編集（チップ差し替え）、マイプレイス登録
- 20 condition 上限への単純な対応（距離ベースカリング。20以下は退避なし）、端末再起動後の監視復元
- 決定論フォールバック（非対応端末 / オフライン）: 時刻語ルール ＋ 登録地名照合
- 条件付き時間バックストップ（期限性が読み取れる場合／低confidence時間フォールバック／手動追加のみ）
- 完全ローカル、アカウント不要、Time Sensitive通知（実成立時のみ）
- **位置権限は WhenInUse を既定の目標**（Always は Phase 0 の結果次第、v1では原則要求しない）

**LATER（v1.1+）**
- 位置 `Always` のオプトイン（バックグラウンド発火の取りこぼしを減らしたいユーザー向け）
- カテゴリPOIの自動網羅・複数同種店への一般化、CLVisit履歴学習で「あなたのスーパー」推定
- Share Extension / App Intents・Siri の高度化、Widget deep-link、Control（iOS 18）
- カレンダー連動（読み取り・任意接続）、クラウドLLM adapter のオプトイン
- 誤判定訂正の学習ループ、CloudKit同期、共有Moment、Watch、Live Activity
- 高度な slot ranking（時間窓近接・recurring 重み・移動方向予測）

**NOT BUILD（v1で入れない）**
- 天気Moment（「降り出す直前」は背景制約で不可能）、Focus変化Moment
- アクティビティ判定（「電車に乗ったら」「運転中」= `CMMotionActivity` は粗く誤判定多）
- 対人トリガー（近接検知手段が実質なし）
- フルタスク管理、常時 `startUpdatingLocation` の高精度網、チャット型AIアシスタント
- 家族/カップル共有、アカウント/課金、Android、Calendar書き込み、カテゴリPOI全自動網羅
- core domain が Foundation Models / `@Generable` を直接 import すること

## 6. v1 Moment 一覧（confidence高い順）

| ユーザー向け Moment（semantic） | Trigger primitive | 権限（v1目標） | 遅延/精度の現実 |
|---|---|---|---|
| `time`（AIが「今夜」「土曜」を時刻化） | `time` | 通知のみ | 高信頼 |
| `place_arrival`（登録地点に到着） | `place_enter(place)` | WhenInUse（不足時のみAlways） | 数十秒〜数分, 半径50〜150m |
| `home_arrival`（帰宅） | `place_enter(home)` | 同上 | 同上 |
| `work_arrival`（出社） | `place_enter(work)` | 同上 | 同上 |
| `place_departure`（登録地点から退出） | `place_exit(place)` | 同上 | 同上, 退出は判定遅め |
| `leave_home`（次に外出） | `place_exit(home)` | 同上 | 前面復帰時 or SLC で確定する場合あり |

- カテゴリ的「スーパー」= v1 は「あなたのスーパーを1つ登録」→ `place_enter(store)` に解決。
- v1で避ける: 天気、カレンダー文脈、任意地点のカテゴリ網羅、アクティビティ判定、対人、分単位精度の位置通知。

## 7. SwiftUI / Flutter の結論 → **SwiftUI（ネイティブ）**

全5役一致。価値の9割がOS深部（位置トリガ、Time Sensitive通知、WidgetKit、App Intents、Foundation Models、
バックグラウンド制御、terminatedからの背景起動）にある。Flutterプラグイン経由では最新API追従・信頼性・審査
リスクで不利。v1はiOS専用戦略なのでクロスプラットフォームの利点は無関係。min iOS 18。

## 8. アーキテクチャ

**3層に分離**: ユーザー向け **Moment（semantic）** / 決定論の **Resolver** / エンジンの **Trigger primitive**。

```
入力（テキスト / (LATER) Siri・ウィジェット）
  │
[Capture]  Note(original_text 不変, capture_context: 時刻帯 / 市区町村) を即保存 ※オフラインOK
  │
[Interpret]  ← Interpreter adapter（protocol。core domain は FoundationModels を import しない）
  │   ├─ FoundationModelsInterpreter（iOS 26+ かつ Apple Intelligence 可用）: 内部 @Generable DTO → canonical へ写像
  │   └─ RuleBasedInterpreter（全端末 / オフライン）: 時刻語 + 登録地名照合 → canonical
  │   （LATER）CloudInterpreter（オプトイン）
  │   出力 = MomentInterpretation（Codable & Sendable, OS非依存 / §10）
  ▼
[Resolve]  ← 決定論
  │   semantic kind + place_ref / poi_category → Trigger primitive へ変換
  │     home_arrival        → place_enter(home)
  │     work_arrival        → place_enter(work)
  │     leave_home / 次に外出 → place_exit(home)
  │     place_arrival(named) → place_enter(place)
  │     place_departure      → place_exit(place)
  │     "スーパー"(poi_category, v1) → place_enter(登録済みstore)
  │     time                 → time(fire_at, window?)
  │   未解決（地名未登録 / 権限不足） → needs_input / unresolved
  ▼
[Arm]  ← 決定論
  │   time                    → UNCalendarNotificationTrigger
  │   place_enter / place_exit → (v1既定) UNLocationNotificationTrigger + WhenInUse
  │                              (Phase 0 で非前面/終了時の信頼性が不足と判明した場合のみ
  │                               CLMonitor + CLServiceSession + Always に切替)
  │   20枠マネージャ（単純カリング） / クールダウン / State Machine / (条件付き)時間バックストップ
  ▼
[Fire] → 通知（Time Sensitive） → [やった] / [次のそのとき] → Event ログ
  │
[Bootstrap]  アプリ / 端末再起動時に armed な Trigger から監視を再構築
```

**責務分離**
- AIがやってよい: 自然文の意図理解、Moment種別（semantic kind）提案、human_label生成、confidence申告、
  期限性の抽出、曖昧さの表明。
- AIがやってはいけない: 座標決定、primitiveへの変換、ジオフェンス登録可否、発火タイミング、状態遷移、
  通知送出、クールダウン計算、20枠の取捨 → **すべて決定論エンジン（Resolve / Arm）**。
  LLMが落ちても・オフラインでも既存Trigger は動く。

**データモデル（SwiftData）**
- `Note`(id, original_text, created_at, capture_context)
- `Moment`(id, note_id, semantic_kind, direction, place_ref?, poi_category?, time_window?, deadline?, recurring, confidence, human_label, state)
- `Trigger`(id, moment_id, primitive[`time`|`place_enter`|`place_exit`], fire_at?, place_id?, radius_m?, backstop_at?)
- `Place`(id, name, kind[home|work|store|other], coordinate, radius, enumerated_pois?)
- `TriggerArming`(id, trigger_id, os_request_id?, armed_at, cooldown_until, slot_rank?)  ※ slot_rank は v1 では単純値
- `Event`(id, moment_id, type[armed|fired|done|next|corrected|expired], at, payload)

**推論の場所**: オンデバイス既定（プライバシー / コストゼロ / オフライン）。非対応端末は RuleBasedInterpreter。
クラウドLLMは v1では使わない（LATERで adapter 追加・既定オフ）。

## 9. Moment State Machine

```
draft ──(Interpret+Resolve成功)──▶ armed ──(Trigger成立)──▶ fired
  │                                 ▲  │                       │
  │(要確認)                           │  │(未解決/権限なし)         ├─[やった]────────▶ done
  ▼                                 │  ▼                       ├─[次のそのとき]──▶ awaiting_next
needs_input ─(入力)─▶ Resolve        │  unresolved              └─(無操作72h)────▶ lapsed
                                     │                              (次機会に1回だけ再提示 → 以後 stale)
awaiting_next ─(その文脈から退出 + 最低距離 + 最小時間でクールダウン解除)─▶ re-arm ─┘
armed ─(backstop_at 到達 / 21日未発火)─▶ stale ─(ユーザー確認)─▶ armed | done
```

- **20枠（単純カリング。過剰実装しない）**: `armed` な `place_enter` / `place_exit` Trigger が **20以下なら
  全部そのまま登録・退避ロジックは動かさない**。20を超えた場合のみ「home/work は常に含める ＋ 残りは現在地からの
  直線距離が近い順」で上位20を実登録、残りは `armed(dormant)`。再計算トリガーは Significant Location Change のみ。
  時間窓近接・recurring 重み・移動方向予測などの高度な ranking は LATER。
- **クールダウン（暴発防止・決定論で厳格化）**: `fired` 後の再武装は「その文脈から一度退出」＋「最低距離移動」
  ＋「最小 N 時間」をすべて満たすまで禁止。昼休みの一時退出は re-enter でキャンセル。1日1回に制限。
- **無限先送り防止**: `[次のそのとき]` は armCount上限5 ＋ expiresAt 30日 ＋ daily_digestで棚卸し。
  3回連続で `[次のそのとき]` されたら次の通知に「これは時間で思い出す?」をそっと追加。

## 10. Canonical AI Structured Output（OS非依存 `Codable` & `Sendable`）

adapter が何であれ（Foundation Models / ルール / クラウド）**この canonical モデルを返す**。
`@Generable` DTO は FoundationModelsInterpreter 内部にのみ存在し、この型へ写像する。

```swift
struct MomentInterpretation: Codable, Sendable {
  let noteID: UUID
  let originalText: String
  let category: String?            // "shopping" | "belongings" | "message" | ...
  let moments: [MomentCandidate]
  let needsUserConfirmation: Bool
  let ambiguityNote: String?
}

struct MomentCandidate: Codable, Sendable {
  let kind: SemanticKind           // time | place_arrival | place_departure | home_arrival | work_arrival | leave_home
  let placeLabel: String?          // "スーパー" / "大学"
  let placeKind: PlaceKind?        // named_place | poi_category | home | work
  let poiCategory: String?         // "grocery" | "convenience" | "pharmacy" | ... (v1は grocery を登録店に解決)
  let direction: Direction?        // arrival | departure
  let timeWindow: DateInterval?
  let deadline: Date?              // 入力から読み取れた期限（無ければ nil → 時間バックストップは付けない）
  let recurringHint: Bool
  let confidence: Double
  let humanLabel: String           // 「次にスーパーに着いたとき」
}
```

例（`牛乳なくなりそう`）: `place_arrival` / placeLabel「スーパー」/ placeKind `poi_category` / poiCategory `grocery`
/ direction `arrival` / recurringHint `true` / confidence `0.82`。`deadline` は nil（枯渇示唆はあるが日時未確定 →
バックストップは付けない。§改訂5）。
例（`傘、大学に置いてきた`）: `place_departure` / placeLabel「大学」/ placeKind `named_place` / confidence `0.71`
/ needsUserConfirmation `true` / ambiguityNote「『大学』が未登録。地図で場所選択が必要」。

**confidence / fallback 初期閾値**
- `≥ 0.75` : 無確認で arm（送信直後にトーストで取消可）。目標は入力の7割以上がこの経路。
- `0.40–0.75` : arm するが結果行を強調 ＋「これでいい? / 変更」インライン。
- `< 0.40` または `needsUserConfirmation` : 最小3択（場所を選ぶ / 今日中 / 週末）＋ 時間フォールバックを主にarm
  → この場合のみ時間バックストップが付く。
- `placeKind = named_place` で未登録 → 座標が無い限り arm 不可。必ず地図1タップ登録（以後 `Place` 再利用）。

## 11. Location 戦略（WhenInUse ファースト）

- **v1 の目標は `When In Use` のみでコア体験を成立させること**。`place_enter` / `place_exit` は
  `UNLocationNotificationTrigger` で登録する。**Always は原則要求しない。**
- **Phase 0 で2方式を実機比較**:
  - (a) `UNLocationNotificationTrigger` + `When In Use`
  - (b) `CLMonitor` + `CLServiceSession` + `Always`
  アプリ前面 / バックグラウンド / 終了 の各状態で、到着・退出通知の発火率と遅延を48h往復で計測。
  **(a) が Killer UC①〜⑤ を満たすなら v1 は (a) で確定し Always を要求しない。** 満たさない項目がある場合のみ、
  その Moment 種別に限って (b) を採用（または Always を LATER のオプトイン強化として提供）。
- **20枠**: §9 の単純カリング。SLC のみを再計算トリガーに。
- **「あなたのスーパー」登録時**: `MKLocalPointsOfInterestRequest`（`.foodMarket` 等）で周辺候補を提示し
  1タップ登録の摩擦を下げる。登録後は通常の `place_enter(place)` として扱う。
- **帰宅/外出**: `place_enter(home)` / `place_exit(home)`。CLVisit は使うとしても遅延許容用途の補助のみ（v1は任意）。
- **オフライン**: 位置トリガの発火・ローカル通知はネット不要。POI座標解決だけネット依存 → 解決済みなら影響なし。
  未解決分は「未整理」トレイ。Reduced accuracy 時は半径を拡大し告知。

## 12. Permission 戦略

| タイミング | 要求する権限 | 文言の要点 |
|---|---|---|
| オンボーディング | 通知のみ（`.provisional` 併用可） | 「そのときにお知らせするために必要です」 |
| 初回の位置Moment作成時 | 位置 `When In Use` | 「この場所で思い出すために使います」 |
| Always | **v1では要求しない**（Phase 0で (a) が不十分と判明した種別のみ、またはLATERのオプトイン） | 「アプリを開いていない時も確実に知らせたい場合だけ」 |
| カレンダー / クラウドAI | v1は要求しない（LATER / オプトイン） | — |

- 位置を断られたユーザーには位置Momentを出さず、日時Momentに寄せる。設定に「位置を有効にすると
  『スーパーで』が使えます」の常設バナー（罪悪感UIにしない）。位置系入力が3件たまったら1回だけ再提案。
- 通知は唯一 **オンボーディング完了をブロックしてよい権限**。
- プライバシーラベル: データ収集なし・トラッキングなし。位置は端末内処理のみ。
- `NSLocationWhenInUseUsageDescription`（v1で必須）/ `NSLocationAlwaysAndWhenInUseUsageDescription`（(b)採用時のみ）
  は用途を具体的に記述。

## 13. 主要画面

1. **入力シート** — 単一フィールド ＋ 送信 ＋ 直近結果（AIが決めたMomentを1行 ＋ 取消）。起動時に入力欄フォーカス。
2. **そのとき一覧** — 待機中 / 繰り返し中 / 棚上げ（30日未成立）/ 完了 の4セクション。
   行 = メモ原文 ＋ Momentチップ（タップで編集）＋ 推定タイミング。左スワイプで やった / 来なかった。
   空状態 = 例文チップ3つをタップで入力欄へ流し込み。
3. **Moment編集シート** — 場所・方向・時間窓のチップ差し替えのみ（文章は編集させない）＋
   **「時間でも念のため知らせる」トグル（＝時間バックストップの手動追加。既定OFF、期限性ありの場合のみ既定ON）**。
4. **マイプレイス** — 自宅・職場・お店を登録/命名（地図1タップ、周辺POI候補提示）。
5. **設定** — 権限状態とその意味、いま監視中の場所の可視化、通知スタイル、AI処理の場所（オンデバイス/(LATER)クラウド）、
   daily_digest時刻、データ書き出し / 全削除。
6. **オンボーディング** — 3枚（コンセプト1文＋例 → その場で1件入力させ解釈を見せる → 通知許可 → 自宅登録は任意）。

**通知**: タイトル = メモ原文 / 本文 = 「そのとき: いまスーパーの近くです」/ アクション = [やった]（完了・アーカイブ）
[次のそのとき]（クールダウン付き再武装）。通知を消しただけ = 保留、次の機会に1回だけ再提示。
interruption level = Time Sensitive（実成立時のみ）。時刻・直近性は表示しない。

**誤判定リカバリ**: 通知に「ちがうタイミングだった」→ 3択（別の場所 / もっと後 / 時間で）。
一覧の各行「来なかった」左スワイプでフィードバック収集 → 時間バックストップ追加を提案。
21日未発火のMomentは「まだ必要?」を1回通知。

## 14. 重大リスクと対策

| # | リスク | 対策 |
|---|---|---|
| 1 | オンデバイスAIが対応端末限定でTAMが縮む | AIは「上乗せ」。RuleBasedInterpreter（時刻語+登録地名）で非対応端末も成立。min iOS 18で母数確保 |
| 2 | 「1回だけ店を登録」はRemindersの住所指定とほぼ同手間 → 差別化が薄い | 差別化は「入力時に考えない/登録は一度きり1タップ」に賭ける。複数店一般化はv1.1。v1の位置価値はマージナルと自覚 |
| 3 | 「次のそのとき」が同じ場所で暴発 or 永久沈黙 | 退出イベント必須 + 最低距離 + 最小/最大時間を決定論で厳格化。**QA最重要項目** |
| 4 | Time Sensitive通知の濫用審査 | 「ユーザーが明示的に待つリマインダーの実成立時のみ」。審査用の正当性説明文を用意 |
| 5 | WhenInUse だけでは非前面/終了時に位置通知が出ない可能性 | **Phase 0 で (a)WhenInUse と (b)Always を実測比較**。(a)で足りる範囲を確定し、足りない種別のみ (b)。足りなければ該当UCをv1から外すか Always をオプトライン化 |
| 6 | 命中率が低いと1事故でアンインストール | Moment を6種・primitive を3種に限定。遅延・精度をオンボで正直に説明（期待値管理） |
| 7 | 「位置系アプリ」というだけで電池非難レビュー | 標準の省電力機能のみと明記。設定に「電池のために休止」トグル。常時測位しない |
| 8 | Focus / 通知要約で埋没 | Time Sensitive で貫通 + 設定手順の導線 |
| 9 | オフライン「未整理トレイ」がコンセプトを壊す | オフラインでも時刻語ルールで最低限arm。トレイ滞留を最小化。復帰時に一括推論 |
| 10 | 位置リマインダー利用者はニッチ | 狭く刺さる層でリテンション先行検証。有料化を焦らない |
| 11 | (b)採用時、`CLServiceSession` 未初期化でバックグラウンド配信停止 | 起動時に必ずセッション確立。健全性チェックと自己修復 |
| 12 | 端末再起動でトリガーが飛ぶ | 起動時に armed な Trigger から監視を再構築するBootstrapを必須実装 |
| 13 | プライバシー不信 | 「入力もトリガーも端末内・位置は一切送信しない・アカウント不要」をオンボと設定で明示 |
| 14 | Foundation Models のAPI変更に core が巻き込まれる | canonical `MomentInterpretation`（Codable/Sendable）に隔離。`@Generable` は adapter 内部のみ |

**作る価値が残る条件 / Go-No-Goゲート（Phase 0で全て満たさなければv1中止 = Remindersで十分）**
- **(A)** 通知のみ（位置なし）でも日時/帰宅/出社Momentで週1回は救済体験。
- **(B)** 位置Momentの命中が体感9割。外れは「遅い」であって「来ない/変な所」ではない。
- **(C)** 入力から手を離すまで実測5秒以内、トリガー設計操作ゼロ（高confidence経路）。
- **(D)** 「次のそのとき」が暴発も沈黙もしないことをQAで保証。
- **(E)** 非対応端末でも RuleBasedInterpreter で Killer UC①②が成立（AIは前提でなく上乗せ）。
- **(F)** 日本語代表30入力でMoment種別（semantic kind）の一致率が実用水準（目安80%+）。
- **(G)** `UNLocationNotificationTrigger + WhenInUse` が、アプリ非前面/終了時でも Killer UC の到着・退出通知を
  実用的に発火する。**満たせない場合のみ** v1 で該当種別に `Always` を採用する（デフォルトは WhenInUse）。

## 15. 開発 Phase

- **Phase 0 — 技術検証スパイク（実機必須・Go/No-Go判定）**:
  - 位置トリガ **2方式の比較**: (a)`UNLocationNotificationTrigger`+WhenInUse vs (b)`CLMonitor`+`CLServiceSession`+Always。
    前面/バックグラウンド/終了 の各状態で発火率・遅延を48h往復計測 → ゲート(G)を判定。
  - FoundationModelsInterpreter（`@Generable` DTO → canonical 写像）の日本語曖昧文精度（代表30入力）。
  - RuleBasedInterpreter だけで到着/退出/日時が成立するか。
  - Time Sensitive通知 / 20枠 単純カリング / クールダウン挙動。
  - §14ゲート A–G を評価し **継続 / スコープ縮小 / 中止** を判断。
- **Phase 1 — コア**: 入力シート → Interpret（adapter）→ Resolve（semantic→primitive）→ 3 primitive の Arm →
  通知（[やった]/[次のそのとき]）→ 一覧 / Moment編集 / マイプレイス。再起動Bootstrap。完全ローカル。
- **Phase 2 — 入口と堅牢化**: オンボーディング磨き、期待値管理コピー、RuleBasedInterpreter 完成度、
  権限デグレード、daily_digest、失効・棚上げ、条件付き時間バックストップ、Reduced accuracy / Low Power エッジ。
  ※Share Extension を前倒し検討。
- **Phase 3 — TestFlight ベータ**: 命中率・「次のそのとき」暴発・電池・WhenInUse だけでの充足度を計測、閾値調整。
- **Phase 4 — App Store 申請**: 位置利用目的説明、Time Sensitive正当性、プライバシーラベル（収集なし）。
- **LATER**: 位置 Always オプトイン / カテゴリPOI網羅 / 複数店一般化 / CLVisit学習 / カレンダー連動 /
  クラウドAI adapter / 高度な slot ranking / Widget・Siri高度化 / Watch。

## 16. Plan承認後の最初の実装タスク（Phase 0 のみ）

1. Xcodeプロジェクト作成（SwiftUI, min iOS 18, SwiftData, ローカルのみ）。core module は FoundationModels 非依存。
2. **Canonical モデル定義**（純Swift, `Codable` & `Sendable`）: `MomentInterpretation` / `MomentCandidate` /
   enum（`SemanticKind` / `PlaceKind` / `Direction`）。§10。
3. **Interpreter protocol** ＋ 2実装:
   - `RuleBasedInterpreter`（時刻語ルール ＋ 登録地名照合。全端末）
   - `FoundationModelsInterpreter`（`#available(iOS 26)` ＋ Apple Intelligence 可用時のみ。内部 `@Generable` DTO →
     canonical へ写像）。factory が可用性で選択。
4. データモデル（`Note` / `Moment` / `Trigger` / `Place` / `TriggerArming` / `Event`）を SwiftData で。
5. **Resolver**（決定論）: semantic kind + place_ref/poi_category → `time` / `place_enter` / `place_exit` の1つに変換。
   未解決は needs_input。
6. **Arm（2方式の実験ハーネス）**:
   - `time` → `UNCalendarNotificationTrigger`
   - `place_enter`/`place_exit` → **方式(a)** `UNLocationNotificationTrigger`+WhenInUse を既定実装、
     **方式(b)** `CLMonitor`+`CLServiceSession`+Always を比較用に実装。ビルド設定 or デバッグトグルで切替。
   - 20枠 単純カリング（20以下は無効）、クールダウン、State Machine（§9）、再起動Bootstrap。
7. 通知ハンドラ（[やった] / [次のそのとき] アクション、`awaiting_next` 再武装）＋ 入力シート ＋ そのとき一覧 ＋
   マイプレイス登録（最小UI）。
8. 実機E2E: 「牛乳なくなりそう」→ スーパー登録 → 到着発火 → [次のそのとき] → 退出 → 再武装 → 再到着で再発火。
9. **48h往復ログ**: (a)/(b) 各方式で前面/バックグラウンド/終了時の発火率・遅延を記録。§14ゲート A–G を評価し所見化。

Phase 1 以降（RuleBased 完成度、UI本番、条件付きバックストップ）はゲート通過後。

### 検証（Phase 0 の受け入れ確認）
- 方式(a) WhenInUse で、アプリ非前面/終了時に `place_enter(home)` / `place_enter(store)` が到着後おおむね数分以内に
  通知を出すか（出るなら v1 は Always 不要）。方式(b) との差分を数値で記録。
- [次のそのとき] 登録後、同一ジオフェンス内滞在中は再発火せず、退出 → 再到着で1回だけ再発火（暴発ゼロ・沈黙ゼロ）。
- 位置権限なしでも日時Momentが期日どおり発火。
- オフライン（機内モード）で「明日 電話する」→ `time` primitive として arm。
- FoundationModels 非対応端末で、RuleBasedInterpreter のみで 到着 / 退出 / 日時 が成立。
- 日本語代表30入力の semantic kind 一致率が 80% 目安。
- core module のユニットテストが FoundationModels を import せずにビルド・パスする。

---

## v1で特に判断したいこと — 結論

| 論点 | 結論 |
|---|---|
| SwiftUI か Flutter か | **SwiftUI（ネイティブ）**。min iOS 18 |
| v1対応 Moment | ユーザー向け6種（到着/退出/帰宅/出社/次に外出/日時）＝ 内部 primitive 3種（`time`/`place_enter`/`place_exit`） |
| 「次にスーパーへ行ったら」 | v1は「あなたのスーパー」を初回1回だけ登録 → `place_enter(store)`。カテゴリ自動網羅はv1.1 |
| 位置情報権限 | **WhenInUse ファースト**。オンボでは要求せず初回位置Moment作成時に WhenInUse。**Always は v1では原則要求しない**（Phase 0で(a)が不十分な種別のみ、またはLATERオプトイン） |
| AI推論後に毎回確認させるか | **させない**。confidence分岐（≥0.75 無確認+取消可 / 0.4–0.75 強調確認 / <0.4 最小3択+時間フォールバック） |
| Calendar / Weather | **どちらも入れない**。Calendarは LATER、Weatherは NOT BUILD |
| アカウント | **不要**。完全ローカル（SwiftData） |
| オフライン時の挙動 | 時刻語はルールで arm、位置トリガ/ローカル通知はネット不要、未解決分のみ「未整理」トレイ、復帰時に一括推論 |
| Region 20 上限 | **v1は単純カリングのみ**（20以下は退避なし、超過時のみ home/work固定+距離順で上位20、SLCで再計算）。高度な ranking は LATER |
| 時間バックストップ | **全位置Momentへの自動付与はしない**。期限性が読み取れる場合 / 低confidence時間フォールバック / 手動追加のみ |
| Foundation Models | canonical AI出力は OS非依存 `Codable`&`Sendable` モデル。`@Generable` は iOS 26+ の adapter 内部のみ。core は非依存 |
| クラウドLLM | v1では使わない（LATERで adapter 追加・既定オフ） |

---

## Appendix: 役割別サマリ（相互レビュー要点）

**Product** — 競合は全て「想起条件」を人に書かせる。リテンションの核は「入れる摩擦の低さ」×「戻ってくる信頼」。
前者がReminders未満なら勝てない。作る価値の条件: ①文→Momentがだいたい当たる ②外しても即直せる ③再アームが実用。

**iOS Engineer** — `UNLocationNotificationTrigger` は WhenInUse でも登録可だが非前面/終了時の発火は要実測。
確実性を取るなら `CLMonitor`+`CLServiceSession`+Always（20上限・SLC再計算）。`UNLocationNotificationTrigger` 単体でも
枠は消費する点に注意。常時測位は禁止（電池審査）。Foundation Models（iOS 26, 無料, オフライン, `@Generable`）は
adapter 化して core から隔離。Flutterは背景ジオフェンス・App Intentsで不利、SwiftUI一択。

**UX** — 最短フロー: 常時入力欄に1行 → 送信 → トーストで解釈提示（Undo付き）、画面遷移ゼロ。確認はconfidence分岐、
毎回確認は摩擦過大・無確認は誤爆離脱。通知では確認しない。`[次のそのとき]` の心的モデル =「“後で”ではなく
“また今度そこ行ったら”」。時間バックストップは「念のため」トグルとして可視化し、既定は控えめに。権限はJust-in-time。

**AI / Architecture** — Interpret は adapter、出力は canonical `Codable`/`Sendable`。semantic kind → 3 primitive は
決定論 Resolver。発火・再アーム・座標計算・再起動復元・20枠は決定論エンジン。Privacy: v1はオンデバイスのみ、
クラウドはLATER。オフラインは入力キュー+ルール分類+「未整理」トレイ。誤判定は手動修正データを貯めるだけ。

**Red Team（最終批判 → 反映済み）** — 失敗要因: Reminders代替性 / 位置遅延 / WhenInUseで足りない可能性 /
誤爆1回離脱 / ネタ枯れ / 非対応端末 / 通知OFF・要約埋没 / 再起動で監視消失 / 無限先送り / category期待外れ /
収益化難 / 日本語解釈の外し。削減: Always前提→WhenInUseファースト / primitive3種へ単純化 / slot ranking→LATER /
バックストップ自動付与→条件限定 / クラウドLLM→v1不使用 / Weather→NOT BUILD。作る価値の条件は §14 ゲート A–G。
**崩れるならApple Remindersで十分。**

---

## Status

**設計のみ。実装・ファイル変更・依存追加は未着手。ユーザーレビュー（5点）反映済み。承認を待つ。承認まで §16 のタスクにも着手しない。**
