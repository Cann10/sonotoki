// Deterministic Resolver — semantic Moment → semantic Trigger, and a semantic
// Trigger → concrete per-place Triggers (1 label → N places).
// No AI here.

import { isSimulatable } from './places';
import { placeKey } from './placeDictionary';
import type { MomentCandidate, PlaceDict, PlaceId, PlaceRef, Trigger } from './types';

export type ResolveResult =
  | { ok: true; trigger: Trigger }
  | { ok: false; reason: string; needsLearning?: boolean; phrase?: string };

/** 候補 → semantic Trigger（場所は意味ラベル or アンカーのまま）。 */
export function resolve(c: MomentCandidate, dict: PlaceDict): ResolveResult {
  switch (c.kind) {
    case 'time':
      if (!c.timeBucket) return { ok: false, reason: '時間帯が特定できませんでした' };
      return { ok: true, trigger: { primitive: 'time', timeBucket: c.timeBucket } };

    case 'home_arrival':
      return anchorTrigger('place_enter', 'home');
    case 'leave_home':
      return anchorTrigger('place_exit', 'home');
    case 'work_arrival':
      return anchorTrigger('place_enter', 'work');

    case 'place_arrival':
    case 'place_departure': {
      const primitive = c.kind === 'place_departure' ? 'place_exit' : 'place_enter';

      if (c.anchorHint) return anchorTrigger(primitive, c.anchorHint);

      const phrase = c.placePhrase ?? c.placeLabel;
      if (!phrase) return { ok: false, reason: '場所が特定できませんでした' };

      const key = placeKey(phrase);
      if ((dict[key]?.length ?? 0) > 0) {
        return { ok: true, trigger: { primitive, ref: { kind: 'label', key } } };
      }
      return {
        ok: false,
        reason: `「${phrase}」がどこか、まだ分かりません`,
        needsLearning: true,
        phrase,
      };
    }
  }
}

function anchorTrigger(
  primitive: 'place_enter' | 'place_exit',
  anchor: 'home' | 'work',
): ResolveResult {
  return { ok: true, trigger: { primitive, ref: { kind: 'anchor', anchor } } };
}

/** semantic な PlaceRef → 登録済みの実 PlaceId 群。 */
export function expandPlaceIds(ref: PlaceRef, dict: PlaceDict): PlaceId[] {
  switch (ref.kind) {
    case 'anchor':
      return [ref.anchor];
    case 'place':
      return [ref.placeId];
    case 'label':
      return (dict[ref.key] ?? []).filter(isSimulatable);
  }
}

/** semantic Trigger → 展開後の per-place Trigger 群（監視/バッジ表示に使う）。 */
export function expandTriggers(trigger: Trigger, dict: PlaceDict): Trigger[] {
  if (trigger.primitive === 'time') return [trigger];
  return expandPlaceIds(trigger.ref, dict).map((placeId) => ({
    primitive: trigger.primitive,
    ref: { kind: 'place', placeId },
  }));
}
