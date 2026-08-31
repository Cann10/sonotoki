// Deterministic trigger engine + Moment state machine.
//
// States: armed → fired → (done | awaiting_next) ; awaiting_next → armed
// "[次のそのとき]" is NOT a time snooze: a Moment only re-arms once the situation
// it belongs to is no longer true, then fires again the next time it becomes true.
//
// Moment holds a *semantic* trigger (label / anchor). Matching expands the label
// into the currently-registered PlaceIds (1 label → N places).

import { isDefaultLabelKey, placeKey } from './placeDictionary';
import { expandPlaceIds, resolve } from './resolver';
import type {
  Moment,
  MomentCandidate,
  MomentInterpretation,
  PlaceDict,
  SituationEvent,
  Trigger,
  WorldState,
} from './types';

export type EngineMomentState = Moment['state'] | 'fired' | 'needs_place';

export interface EngineMoment extends Omit<Moment, 'state'> {
  state: EngineMomentState;
}

export interface ArmOptions {
  id?: string;
  now?: number;
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

function isLearnedCustomLabel(trigger: Trigger): boolean {
  return (
    trigger.primitive !== 'time' &&
    trigger.ref.kind === 'label' &&
    !isDefaultLabelKey(trigger.ref.key)
  );
}

function placeTriggerFor(kind: MomentCandidate['kind'], phrase: string): Trigger {
  const primitive = kind === 'place_departure' ? 'place_exit' : 'place_enter';
  return { primitive, ref: { kind: 'label', key: placeKey(phrase) } };
}

function humanLabelForLearned(kind: MomentCandidate['kind'], phrase: string): string {
  return kind === 'place_departure' ? `次に${phrase}を出るとき` : `次に${phrase}に着いたとき`;
}

/** 選んだ候補から armed な Moment を作る。resolve できなければ null。 */
export function armMoment(
  interpretation: MomentInterpretation,
  candidate: MomentCandidate,
  dict: PlaceDict,
  opts: ArmOptions = {},
): EngineMoment | null {
  const resolved = resolve(candidate, dict);
  if (!resolved.ok) return null;

  const now = opts.now ?? Date.now();
  const trigger = resolved.trigger;

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
    learnedPlace: isLearnedCustomLabel(trigger),
  };
}

/**
 * 独自の呼び方だがまだ場所が登録されていない候補から、「場所を教えて」待ちの Moment を作る。
 * trigger は最終形の semantic ラベルにしておき、teach 時は状態を armed にするだけ。
 */
export function buildLearningMoment(
  interpretation: MomentInterpretation,
  candidate: MomentCandidate,
  opts: ArmOptions = {},
): EngineMoment {
  const now = opts.now ?? Date.now();
  const phrase = candidate.placePhrase ?? candidate.placeLabel ?? 'その場所';
  return {
    id: opts.id ?? newId(),
    originalText: interpretation.originalText,
    humanLabel: candidate.humanLabel,
    kind: candidate.kind,
    trigger: placeTriggerFor(candidate.kind, phrase),
    recurring: candidate.recurringHint,
    lowConfidence: false,
    state: 'needs_place',
    createdAt: now,
    firedCount: 0,
    placePhrase: phrase,
    learnedPlace: false,
  };
}

/** needs_place の Moment を armed にする（辞書に場所が入った後）。trigger は変えない。 */
export function resolveLearnedMoment(m: EngineMoment): EngineMoment {
  const phrase = m.placePhrase ?? 'その場所';
  return {
    ...m,
    humanLabel: humanLabelForLearned(m.kind, phrase),
    state: 'armed',
    learnedPlace: true,
  };
}

function triggerMatches(trigger: Trigger, event: SituationEvent, dict: PlaceDict): boolean {
  if (trigger.primitive === 'time') {
    return event.type === 'time' && event.timeBucket === trigger.timeBucket;
  }
  const ids = expandPlaceIds(trigger.ref, dict);
  if (trigger.primitive === 'place_enter') {
    return event.type === 'enter' && ids.includes(event.placeId);
  }
  return event.type === 'exit' && ids.includes(event.placeId);
}

/** その Moment の「状況」が今まさに成立しているか。 */
export function contextActive(trigger: Trigger, world: WorldState, dict: PlaceDict): boolean {
  if (trigger.primitive === 'time') return world.lastTimeBucket === trigger.timeBucket;
  if (world.location === 'outside') return false;
  return expandPlaceIds(trigger.ref, dict).includes(world.location);
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
  dict: PlaceDict,
  now: number = Date.now(),
): ApplyResult {
  const nextWorld = applyEventToWorld(world, event);
  const firedIds: string[] = [];
  const justRearmed = new Set<string>();

  const next = moments.map((m) => {
    if (m.state === 'awaiting_next' && !contextActive(m.trigger, nextWorld, dict)) {
      justRearmed.add(m.id);
      return { ...m, state: 'armed' as EngineMomentState };
    }
    return m;
  });

  const fired = next.map((m) => {
    if (m.state === 'armed' && !justRearmed.has(m.id) && triggerMatches(m.trigger, event, dict)) {
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
  dict: PlaceDict,
): EngineMoment[] {
  return moments.map((m) => {
    if (m.id !== id) return m;
    const state: EngineMomentState = contextActive(m.trigger, world, dict)
      ? 'awaiting_next'
      : 'armed';
    return { ...m, state };
  });
}
