// Canonical domain types for「そのとき」.
// These mirror the SwiftUI port (ios/SonotokiKit) so web and native share one
// vocabulary. Nothing here depends on React or the DOM.

/** What kind of real-world situation should bring a memo back. */
export type SemanticKind =
  | 'place_arrival' // 着いたら
  | 'place_departure' // 出るとき
  | 'home_arrival' // 帰宅したとき
  | 'leave_home' // 出かけるとき
  | 'work_arrival' // 出社したとき
  | 'time'; // 時間帯（夕方 / 朝）

export type Anchor = 'home' | 'work';

/** POI category hint（将来の「近くのスーパー全部」用。v1 は登録店で解決）。 */
export type PoiCategory = 'grocery' | 'convenience' | 'pharmacy';

export type TimeBucket = 'this_evening' | 'tomorrow_morning';

export type Direction = 'arrival' | 'departure';

/** One way the interpreter thinks a memo could resurface. */
export interface MomentCandidate {
  kind: SemanticKind;
  /** 人が読むラベル（「スーパー」「大学」）。 */
  placeLabel?: string;
  poiCategoryHint?: PoiCategory;
  direction?: Direction;
  timeBucket?: TimeBucket;
  /** 入力から期限が読み取れたときだけ true（時間バックストップの条件）。 */
  hasDeadline: boolean;
  /** 同じ状況で何度も戻したい類のメモか（買い物など）。 */
  recurringHint: boolean;
  confidence: number; // 0..1
  humanLabel: string; // 「次にスーパーに着いたとき」
  /** 場所の呼び方（「ジム」「実家」「スーパー」）。帰宅/出社では未設定。 */
  placePhrase?: string;
  /** その呼び方に、まだ実際の場所が1つも登録されていない → 一度だけ尋ねる。 */
  needsPlaceLearning?: boolean;
  /** 「会社」「職場」など、固定アンカーに直結する場合（辞書を通さない）。 */
  anchorHint?: Anchor;
}

export interface MomentInterpretation {
  originalText: string;
  category?: string; // "shopping" | "belongings" | "errand" | "message"
  moments: MomentCandidate[]; // 確信度の高い順
  needsUserConfirmation: boolean;
  ambiguityNote?: string;
}

// --- Concrete places the simulator can be at ---

export type PlaceId =
  | 'home'
  | 'work'
  | 'poi:grocery'
  | 'poi:convenience'
  | 'poi:pharmacy'
  | `named:${string}`;

// --- Trigger primitives (the deterministic engine only knows these three) ---
//
// Trigger は semantic。場所は「意味ラベル」または固定アンカーで保持し、
// Resolver が登録済みの複数 PlaceId に展開する（1ラベル → 複数店舗）。

export type PlaceRef =
  | { kind: 'anchor'; anchor: Anchor } // 家 / 職場（単一地点）
  | { kind: 'label'; key: string } // placeKey。dict で複数 PlaceId に展開
  | { kind: 'place'; placeId: PlaceId }; // 展開後の1地点（expandTriggers の出力）

export type Trigger =
  | { primitive: 'place_enter'; ref: PlaceRef }
  | { primitive: 'place_exit'; ref: PlaceRef }
  | { primitive: 'time'; timeBucket: TimeBucket };

// --- Personal Place Dictionary: 1 意味ラベル → 複数の実場所 ---

/** placeKey（正規化した呼び方）→ 登録済みの実 PlaceId 群。 */
export type PlaceDict = Record<string, PlaceId[]>;

// --- Moment: a memo armed to a (semantic) trigger ---

export type MomentState = 'armed' | 'awaiting_next' | 'done';

export interface Moment {
  id: string;
  originalText: string;
  humanLabel: string;
  kind: SemanticKind;
  /** semantic。発火判定時に dict で複数 PlaceId へ展開される。 */
  trigger: Trigger;
  recurring: boolean;
  lowConfidence: boolean;
  timeBackstop?: TimeBucket;
  state: MomentState;
  createdAt: number;
  firedCount: number;
  lastFiredAt?: number;
  /** このメモの場所の呼び方（「ジム」など）。 */
  placePhrase?: string;
  /** 独自の呼び方を辞書が解決した（＝「覚えています」表示の対象）。 */
  learnedPlace?: boolean;
}

// --- Simulator world ---

/** 今いる場所。'outside' はどの場所にもいない状態。 */
export type WorldLocation = 'outside' | PlaceId;

export interface WorldState {
  location: WorldLocation;
  lastTimeBucket?: TimeBucket;
}

export type SituationEvent =
  | { type: 'enter'; placeId: PlaceId }
  | { type: 'exit'; placeId: PlaceId }
  | { type: 'time'; timeBucket: TimeBucket };
