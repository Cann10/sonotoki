import { describe, expect, it } from 'vitest';
import { resolve } from './resolver';
import type { MomentCandidate } from './types';

const base: MomentCandidate = {
  kind: 'time',
  hasDeadline: false,
  recurringHint: false,
  confidence: 0.8,
  humanLabel: '',
};

describe('resolve — semantic Moment を 3 つの primitive に落とす', () => {
  it('place_arrival + grocery → place_enter(poi:grocery)', () => {
    const r = resolve({ ...base, kind: 'place_arrival', poiCategory: 'grocery', placeKind: 'poi_category' });
    expect(r).toEqual({ ok: true, trigger: { primitive: 'place_enter', placeId: 'poi:grocery' } });
  });

  it('place_departure + 大学 → place_exit(named:大学)', () => {
    const r = resolve({ ...base, kind: 'place_departure', placeLabel: '大学', placeKind: 'named_place' });
    expect(r).toEqual({ ok: true, trigger: { primitive: 'place_exit', placeId: 'named:大学' } });
  });

  it('home_arrival → place_enter(home) / leave_home → place_exit(home)', () => {
    expect(resolve({ ...base, kind: 'home_arrival' })).toEqual({
      ok: true,
      trigger: { primitive: 'place_enter', placeId: 'home' },
    });
    expect(resolve({ ...base, kind: 'leave_home' })).toEqual({
      ok: true,
      trigger: { primitive: 'place_exit', placeId: 'home' },
    });
  });

  it('work_arrival → place_enter(work)', () => {
    expect(resolve({ ...base, kind: 'work_arrival' })).toEqual({
      ok: true,
      trigger: { primitive: 'place_enter', placeId: 'work' },
    });
  });

  it('time → time(bucket)', () => {
    expect(resolve({ ...base, kind: 'time', timeBucket: 'tomorrow_morning' })).toEqual({
      ok: true,
      trigger: { primitive: 'time', timeBucket: 'tomorrow_morning' },
    });
  });

  it('シミュレーターに無い名前付きの場所は解決不可を返す', () => {
    const r = resolve({ ...base, kind: 'place_arrival', placeLabel: '実家', placeKind: 'named_place' });
    expect(r.ok).toBe(false);
  });
});
