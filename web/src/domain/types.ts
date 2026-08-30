// Canonical domain types for「そのとき」.
// These mirror the approved SwiftUI plan (§10 / §8) so the web prototype and the
// later native app share one vocabulary. Nothing here depends on React or the DOM.

/** What kind of real-world situation should bring a memo back. */
export type SemanticKind =
  | 'place_arrival' // 着いたら（カテゴリ店 or 名前付きの場所）
  | 'place_departure' // 出るとき（名前付きの場所）
  | 'home_arrival' // 帰宅したとき
  | 'leave_home' // 出かけるとき
  | 'work_arrival' // 出社したとき
  | 'time'; // 時間帯（夕方 / 朝）

export type PlaceKind = 'poi_category' | 'named_place' | 'home' | 'work';

/** POI categories the simulator can model. */
export type PoiCategory = 'grocery' | 'convenience' | 'pharmacy';

export type TimeBucket = 'this_evening' | 'tomorrow_morning';

export type Direction = 'arrival' | 'departure';

/** One way the interpreter thinks a memo could resurface. */
export interface MomentCandidate {
  kind: SemanticKind;
  placeLabel?: string; // 「スーパー」「大学」など、人が読むラベル
  placeKind?: PlaceKind;
  poiCategory?: PoiCategory;
  direction?: Direction;
  timeBucket?: TimeBucket;
  /** 入力から期限が読み取れたときだけ true（時間バックストップの条件）。 */
  hasDeadline: boolean;
  /** 同じ状況で何度も戻したい類のメモか（買い物など）。 */
  recurringHint: boolean;
  confidence: number; // 0..1
  humanLabel: string; // 「次にスーパーに着いたとき」
}

export interface MomentInterpretation {
  originalText: string;
  category?: string; // "shopping" | "belongings" | "errand" | "message" | ...
  moments: MomentCandidate[]; // 確信度の高い順
  needsUserConfirmation: boolean;
  ambiguityNote?: string;
}

// --- Trigger primitives (the deterministic engine only knows these three) ---

export type PlaceId =
  | 'home'
  | 'work'
  | 'poi:grocery'
  | 'poi:convenience'
  | 'poi:pharmacy'
  | `named:${string}`;

export type Trigger =
  | { primitive: 'place_enter'; placeId: PlaceId }
  | { primitive: 'place_exit'; placeId: PlaceId }
  | { primitive: 'time'; timeBucket: TimeBucket };

// --- Moment: a memo that has been armed to a trigger ---

export type MomentState = 'armed' | 'awaiting_next' | 'done';

export interface Moment {
  id: string;
  originalText: string;
  humanLabel: string;
  kind: SemanticKind;
  trigger: Trigger;
  recurring: boolean;
  lowConfidence: boolean;
  /** 時間でも念のため知らせる（期限が読み取れた / 手動で付けた場合のみ）。 */
  timeBackstop?: TimeBucket;
  state: MomentState;
  createdAt: number;
  firedCount: number;
  lastFiredAt?: number;
}

// --- Simulator world ---

/** 今いる場所。'outside' はどの場所にもいない状態。 */
export type WorldLocation = 'outside' | PlaceId;

export interface WorldState {
  location: WorldLocation;
  /** 直近に通過した時間帯（同じ時間帯の連続発火を防ぐ）。 */
  lastTimeBucket?: TimeBucket;
}

export type SituationEvent =
  | { type: 'enter'; placeId: PlaceId }
  | { type: 'exit'; placeId: PlaceId }
  | { type: 'time'; timeBucket: TimeBucket };
