// Deterministic trigger engine + Moment state machine.
//
// States: armed → fired → (done | awaiting_next) ; awaiting_next → armed
// "[次のそのとき]" is NOT a time snooze: a Moment only re-arms once the situation
// it belongs to is no longer true, then fires again the next time it becomes true.

import { placeLabel } from './places';
import { resolve } from './resolver';
import type {
  Moment,
  MomentCandidate,
  MomentInterpretation,
  PlaceId,
  SituationEvent,
  Trigger,
  WorldState,
} from './types';

// 'needs_place' = 独自の場所の呼び方を、ユーザーがまだ実際の場所に結びつけていない。
export type EngineMomentState = Moment['state'] | 'fired' | 'needs_place';

export interface EngineMoment extends Omit<Moment, 'state'> {
  state: EngineMomentState;
}

export interface ArmOptions {
  id?: string;
  now?: number;
  /** 「時間でも念のため知らせる」を手動で付けるとき。 */
  forceTimeBackstop?: boolean;
}

let counter = 0;
const fallbackId = () => {
  counter += 1;
  return `m_${Date.now().toString(36)}_${counter}`;
};

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return fallbackId();
}

/** 選んだ候補から armed な Moment を作る。resolve できなければ null。 */
export function armMoment(
  interpretation: MomentInterpretation,
  candidate: MomentCandidate,
  opts: ArmOptions = {},
): EngineMoment | null {
  const resolved = resolve(candidate);
  if (!resolved.ok) return null;

  const now = opts.now ?? Date.now();
  const trigger: Trigger = resolved.trigger;

  const timeBackstop =
    trigger.primitive === 'time'
      ? undefined
      : opts.forceTimeBackstop || candidate.hasDeadline
        ? candidate.timeBucket ?? 'this_evening'
        : undefined;

  return {
    id: opts.id ?? newId(),
    originalText: interpretation.originalText,
    humanLabel: candidate.humanLabel,
    kind: candidate.kind,
    trigger,
    recurring: candidate.recurringHint,
    lowConfidence: candidate.confidence < 0.55,
    timeBackstop,
    state: 'armed',
    createdAt: now,
    firedCount: 0,
    placePhrase: candidate.placePhrase,
    learnedPlace: candidate.learnedPlaceId != null,
  };
}

/**
 * 独自の場所の呼び方だが辞書に無い候補から、「場所を教えて」待ちの Moment を作る。
 * trigger は仮置き（needs_place の間はエンジンが評価しない）。
 */
export function buildLearningMoment(
  interpretation: MomentInterpretation,
  candidate: MomentCandidate,
  opts: ArmOptions = {},
): EngineMoment {
  const now = opts.now ?? Date.now();
  return {
    id: opts.id ?? newId(),
    originalText: interpretation.originalText,
    humanLabel: candidate.humanLabel,
    kind: candidate.kind,
    trigger: { primitive: 'time', timeBucket: 'this_evening' }, // 仮置き
    recurring: candidate.recurringHint,
    lowConfidence: false,
    state: 'needs_place',
    createdAt: now,
    firedCount: 0,
    placePhrase: candidate.placePhrase,
    learnedPlace: false,
  };
}

/** needs_place の Moment に実際の場所を教えて armed にする。 */
export function resolveLearnedMoment(m: EngineMoment, placeId: PlaceId): EngineMoment {
  const primitive = m.kind === 'place_departure' ? 'place_exit' : 'place_enter';
  const phrase = m.placePhrase ?? placeLabel(placeId);
  const humanLabel =
    m.kind === 'place_departure' ? `次に${phrase}を出るとき` : `次に${phrase}に着いたとき`;
  return {
    ...m,
    trigger: { primitive, placeId },
    humanLabel,
    state: 'armed',
    learnedPlace: true,
  };
}

function triggerMatches(trigger: Trigger, event: SituationEvent): boolean {
  switch (trigger.primitive) {
    case 'place_enter':
      return event.type === 'enter' && event.placeId === trigger.placeId;
    case 'place_exit':
      return event.type === 'exit' && event.placeId === trigger.placeId;
    case 'time':
      return event.type === 'time' && event.timeBucket === trigger.timeBucket;
  }
}

/** その Moment の「状況」が今まさに成立しているか。 */
export function contextActive(trigger: Trigger, world: WorldState): boolean {
  switch (trigger.primitive) {
    case 'place_enter':
    case 'place_exit':
      return world.location === trigger.placeId;
    case 'time':
      return world.lastTimeBucket === trigger.timeBucket;
  }
}

export function applyEventToWorld(world: WorldState, event: SituationEvent): WorldState {
  switch (event.type) {
    case 'enter':
      return { ...world, location: event.placeId };
    case 'exit':
      return world.location === event.placeId ? { ...world, location: 'outside' } : world;
    case 'time':
      return { ...world, lastTimeBucket: event.timeBucket };
  }
}

export interface ApplyResult {
  moments: EngineMoment[];
  world: WorldState;
  firedIds: string[];
}

/**
 * 状況イベントを1つ適用する。
 * 1) ワールドを更新 → 2) 状況から抜けた awaiting_next を再武装 → 3) armed の一致判定で発火
 */
export function applySituation(
  moments: EngineMoment[],
  world: WorldState,
  event: SituationEvent,
  now: number = Date.now(),
): ApplyResult {
  const nextWorld = applyEventToWorld(world, event);
  const firedIds: string[] = [];
  const justRearmed = new Set<string>();

  const next = moments.map((m) => {
    if (m.state === 'awaiting_next' && !contextActive(m.trigger, nextWorld)) {
      justRearmed.add(m.id);
      return { ...m, state: 'armed' as EngineMomentState };
    }
    return m;
  });

  const fired = next.map((m) => {
    // 同じイベントで「状況から抜けて再武装」した Moment は、その場で発火させない
    // （例: 大学を出て再武装 → 次に大学を出るときに発火）
    if (m.state === 'armed' && !justRearmed.has(m.id) && triggerMatches(m.trigger, event)) {
      firedIds.push(m.id);
      return {
        ...m,
        state: 'fired' as EngineMomentState,
        firedCount: m.firedCount + 1,
        lastFiredAt: now,
      };
    }
    return m;
  });

  return { moments: fired, world: nextWorld, firedIds };
}

/** [やった] */
export function markDone(moments: EngineMoment[], id: string): EngineMoment[] {
  return moments.map((m) => (m.id === id ? { ...m, state: 'done' } : m));
}

/**
 * [次のそのとき] — 時間スヌーズではなく、同じ状況の次回に再通知。
 * すでに状況から抜けていれば即 armed、まだ状況の中なら抜けるまで awaiting_next。
 */
export function markNext(
  moments: EngineMoment[],
  world: WorldState,
  id: string,
): EngineMoment[] {
  return moments.map((m) => {
    if (m.id !== id) return m;
    const state: EngineMomentState = contextActive(m.trigger, world) ? 'awaiting_next' : 'armed';
    return { ...m, state };
  });
}
