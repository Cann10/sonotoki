// Deterministic Resolver — semantic Moment → one of three trigger primitives
// (time / place_enter / place_exit). No AI here (plan §改訂2).

import { isSimulatable } from './places';
import type { MomentCandidate, PlaceId, Trigger } from './types';

export type ResolveResult =
  | { ok: true; trigger: Trigger }
  | { ok: false; reason: string };

export function resolve(c: MomentCandidate): ResolveResult {
  switch (c.kind) {
    case 'time': {
      if (!c.timeBucket) return { ok: false, reason: '時間帯が特定できませんでした' };
      return { ok: true, trigger: { primitive: 'time', timeBucket: c.timeBucket } };
    }

    case 'home_arrival':
      return { ok: true, trigger: { primitive: 'place_enter', placeId: 'home' } };

    case 'leave_home':
      return { ok: true, trigger: { primitive: 'place_exit', placeId: 'home' } };

    case 'work_arrival':
      return { ok: true, trigger: { primitive: 'place_enter', placeId: 'work' } };

    case 'place_arrival': {
      const placeId = placeIdFor(c);
      if (!placeId) return { ok: false, reason: '場所が特定できませんでした' };
      if (!isSimulatable(placeId)) return { ok: false, reason: `「${label(c)}」はまだ登録されていません` };
      return { ok: true, trigger: { primitive: 'place_enter', placeId } };
    }

    case 'place_departure': {
      const placeId = placeIdFor(c);
      if (!placeId) return { ok: false, reason: '場所が特定できませんでした' };
      if (!isSimulatable(placeId)) return { ok: false, reason: `「${label(c)}」はまだ登録されていません` };
      return { ok: true, trigger: { primitive: 'place_exit', placeId } };
    }
  }
}

function placeIdFor(c: MomentCandidate): PlaceId | undefined {
  if (c.placeKind === 'work') return 'work';
  if (c.poiCategory) return `poi:${c.poiCategory}`;
  if (c.placeLabel) return `named:${c.placeLabel}`;
  return undefined;
}

function label(c: MomentCandidate): string {
  return c.placeLabel ?? c.poiCategory ?? 'その場所';
}
