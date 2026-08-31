import { describe, expect, it } from 'vitest';
import { freshDict, learnPlace } from './placeDictionary';
import { expandPlaceIds, expandTriggers, resolve } from './resolver';
import type { MomentCandidate, PlaceDict } from './types';

const base: MomentCandidate = {
  kind: 'time',
  hasDeadline: false,
  recurringHint: false,
  confidence: 0.8,
  humanLabel: '',
};

describe('resolve — 候補 → semantic Trigger', () => {
  it('time → time trigger', () => {
    const r = resolve({ ...base, kind: 'time', timeBucket: 'tomorrow_morning' }, {});
    expect(r).toEqual({ ok: true, trigger: { primitive: 'time', timeBucket: 'tomorrow_morning' } });
  });

  it('帰宅 / 出社 → anchor ref', () => {
    expect(resolve({ ...base, kind: 'home_arrival' }, {})).toEqual({
      ok: true,
      trigger: { primitive: 'place_enter', ref: { kind: 'anchor', anchor: 'home' } },
    });
    expect(resolve({ ...base, kind: 'work_arrival' }, {})).toEqual({
      ok: true,
      trigger: { primitive: 'place_enter', ref: { kind: 'anchor', anchor: 'work' } },
    });
  });

  it('anchorHint が最優先', () => {
    const r = resolve({ ...base, kind: 'place_departure', placePhrase: '職場', anchorHint: 'work' }, {});
    expect(r).toEqual({
      ok: true,
      trigger: { primitive: 'place_exit', ref: { kind: 'anchor', anchor: 'work' } },
    });
  });

  it('登録済みの呼び方 → label ref（実場所は展開時に解決）', () => {
    const dict: PlaceDict = { スーパー: ['poi:grocery', 'poi:convenience'] };
    const r = resolve({ ...base, kind: 'place_arrival', placePhrase: 'スーパー' }, dict);
    expect(r).toEqual({
      ok: true,
      trigger: { primitive: 'place_enter', ref: { kind: 'label', key: 'スーパー' } },
    });
  });

  it('未登録の呼び方 → needsLearning', () => {
    const r = resolve({ ...base, kind: 'place_arrival', placePhrase: '実家' }, {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.needsLearning).toBe(true);
      expect(r.phrase).toBe('実家');
    }
  });
});

describe('expand — semantic → 複数の実場所 / 複数 Trigger', () => {
  it('expandPlaceIds: label は登録済みの全店に展開', () => {
    const dict: PlaceDict = { スーパー: ['poi:grocery', 'poi:convenience'] };
    expect(expandPlaceIds({ kind: 'label', key: 'スーパー' }, dict)).toEqual([
      'poi:grocery',
      'poi:convenience',
    ]);
    expect(expandPlaceIds({ kind: 'anchor', anchor: 'home' }, dict)).toEqual(['home']);
    expect(expandPlaceIds({ kind: 'label', key: '未登録' }, dict)).toEqual([]);
  });

  it('expandTriggers: 1 semantic Trigger → 店の数だけの per-place Trigger', () => {
    const dict = learnPlace(learnPlace(freshDict(), 'スーパー', 'poi:convenience'), 'スーパー', 'poi:grocery');
    // dict['スーパー'] = ['poi:grocery', 'poi:convenience']（freshDict の1件 + 追加、順序は grocery が先）
    const triggers = expandTriggers(
      { primitive: 'place_enter', ref: { kind: 'label', key: 'スーパー' } },
      dict,
    );
    expect(triggers).toEqual([
      { primitive: 'place_enter', ref: { kind: 'place', placeId: 'poi:grocery' } },
      { primitive: 'place_enter', ref: { kind: 'place', placeId: 'poi:convenience' } },
    ]);
  });

  it('expandTriggers: time はそのまま', () => {
    const t = { primitive: 'time', timeBucket: 'this_evening' } as const;
    expect(expandTriggers(t, {})).toEqual([t]);
  });
});
