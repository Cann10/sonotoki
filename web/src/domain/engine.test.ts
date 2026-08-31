import { beforeEach, describe, expect, it } from 'vitest';
import {
  applySituation,
  armMoment,
  buildLearningMoment,
  markDone,
  markNext,
  resolveLearnedMoment,
  type EngineMoment,
} from './engine';
import { interpret } from './interpreter';
import { freshDict, learnPlace } from './placeDictionary';
import { INITIAL_WORLD } from './storage';
import type { PlaceDict, PlaceId, SituationEvent, WorldState } from './types';

const enter = (placeId: PlaceId): SituationEvent => ({ type: 'enter', placeId });
const exit = (placeId: PlaceId): SituationEvent => ({ type: 'exit', placeId });

function arm(text: string, id: string, dict: PlaceDict): EngineMoment {
  const interpretation = interpret(text, dict);
  const m = armMoment(interpretation, interpretation.moments[0], dict, { id, now: 0 });
  if (!m) throw new Error(`could not arm: ${text}`);
  return m;
}

describe('trigger engine — arm → fire → [やった] / [次のそのとき]', () => {
  let dict: PlaceDict;
  let moments: EngineMoment[];
  let world: WorldState;

  beforeEach(() => {
    dict = freshDict(); // スーパー → poi:grocery
    moments = [arm('牛乳なくなりそう', 'milk', dict)];
    world = { ...INITIAL_WORLD };
  });

  it('セマンティックなラベルを持つ（実場所ではない）', () => {
    expect(moments[0].trigger).toEqual({
      primitive: 'place_enter',
      ref: { kind: 'label', key: 'スーパー' },
    });
  });

  it('登録済みの店（poi:grocery）に着くと発火する', () => {
    const r = applySituation(moments, world, enter('poi:grocery'), dict, 1);
    expect(r.firedIds).toEqual(['milk']);
    expect(r.moments[0].state).toBe('fired');
  });

  it('1ラベルに店を足すと、どちらの店でも発火する', () => {
    const d2 = learnPlace(dict, 'スーパー', 'poi:convenience');
    const r1 = applySituation(moments, world, enter('poi:convenience'), d2, 1);
    expect(r1.firedIds).toEqual(['milk']); // 追加した店でも鳴る
  });

  it('関係ない場所では発火しない', () => {
    const r = applySituation(moments, world, enter('named:大学'), dict, 1);
    expect(r.firedIds).toEqual([]);
  });

  it('[やった] のあとは再訪しても鳴らない', () => {
    let r = applySituation(moments, world, enter('poi:grocery'), dict, 1);
    r = { ...r, moments: markDone(r.moments, 'milk') };
    r = applySituation(r.moments, r.world, exit('poi:grocery'), dict, 2);
    r = applySituation(r.moments, r.world, enter('poi:grocery'), dict, 3);
    expect(r.firedIds).toEqual([]);
    expect(r.moments[0].state).toBe('done');
  });

  it('[次のそのとき] は時間スヌーズではなく、店を出て再訪で再発火', () => {
    let r = applySituation(moments, world, enter('poi:grocery'), dict, 1);
    expect(r.firedIds).toEqual(['milk']);

    r = { ...r, moments: markNext(r.moments, r.world, 'milk', dict) };
    expect(r.moments[0].state).toBe('awaiting_next');

    r = applySituation(r.moments, r.world, enter('poi:grocery'), dict, 2);
    expect(r.firedIds).toEqual([]); // 店内では鳴らない

    r = applySituation(r.moments, r.world, exit('poi:grocery'), dict, 3);
    expect(r.moments[0].state).toBe('armed'); // 抜けたら再武装

    r = applySituation(r.moments, r.world, enter('poi:grocery'), dict, 4);
    expect(r.firedIds).toEqual(['milk']);
    expect(r.moments[0].firedCount).toBe(2);
  });

  it('店を出た後に [次のそのとき] → 即 armed', () => {
    let r = applySituation(moments, world, enter('poi:grocery'), dict, 1);
    r = applySituation(r.moments, r.world, exit('poi:grocery'), dict, 2);
    r = { ...r, moments: markNext(r.moments, r.world, 'milk', dict) };
    expect(r.moments[0].state).toBe('armed');
  });

  it('退出トリガー：大学を出るときに発火（着いただけでは鳴らない）', () => {
    const ms = [arm('傘、大学に置いてきた', 'umb', dict)];
    let r = applySituation(ms, { location: 'outside' }, enter('named:大学'), dict, 1);
    expect(r.firedIds).toEqual([]);
    r = applySituation(r.moments, r.world, exit('named:大学'), dict, 2);
    expect(r.firedIds).toEqual(['umb']);
  });

  it('同じイベントで「抜けて再武装」した Moment はその場では発火しない', () => {
    const m: EngineMoment = { ...arm('傘、大学に置いてきた', 'umb', dict), state: 'awaiting_next' };
    let r = applySituation([m], { location: 'named:大学' }, exit('named:大学'), dict, 1);
    expect(r.moments[0].state).toBe('armed');
    expect(r.firedIds).toEqual([]);
    r = applySituation(r.moments, r.world, enter('named:大学'), dict, 2);
    r = applySituation(r.moments, r.world, exit('named:大学'), dict, 3);
    expect(r.firedIds).toEqual(['umb']);
  });

  it('複数の Moment が同じイベントで同時に発火', () => {
    const ms = [arm('牛乳なくなりそう', 'milk', dict), arm('卵も買う', 'egg', dict)];
    const r = applySituation(ms, { location: 'outside' }, enter('poi:grocery'), dict, 1);
    expect(new Set(r.firedIds)).toEqual(new Set(['milk', 'egg']));
  });

  it('時間トリガー：夕方で発火、別の時間帯を挟んで再度夕方で再発火', () => {
    const it0 = interpret('今日中に郵便出す', dict);
    const m = armMoment(it0, it0.moments[0], dict, { id: 'mail', now: 0 })!;
    let r = applySituation([m], { location: 'outside' }, { type: 'time', timeBucket: 'this_evening' }, dict, 1);
    expect(r.firedIds).toEqual(['mail']);

    r = { ...r, moments: markNext(r.moments, r.world, 'mail', dict) };
    expect(r.moments[0].state).toBe('awaiting_next');
    r = applySituation(r.moments, r.world, { type: 'time', timeBucket: 'tomorrow_morning' }, dict, 2);
    expect(r.moments[0].state).toBe('armed');
    r = applySituation(r.moments, r.world, { type: 'time', timeBucket: 'this_evening' }, dict, 3);
    expect(r.firedIds).toEqual(['mail']);
  });
});

describe('teach flow — 独自の呼び方', () => {
  it('未登録 → needs_place → teach で armed → 発火', () => {
    const dict0: PlaceDict = {}; // 何も無い
    const it0 = interpret('ジムに着いたらプロテイン', dict0);
    expect(it0.moments[0].needsPlaceLearning).toBe(true);

    let m = buildLearningMoment(it0, it0.moments[0], { id: 'p', now: 0 });
    expect(m.state).toBe('needs_place');
    expect(m.trigger).toEqual({ primitive: 'place_enter', ref: { kind: 'label', key: 'ジム' } });

    // 状況を動かしても発火しない
    let r = applySituation([m], { location: 'outside' }, enter('work'), {}, 1);
    expect(r.firedIds).toEqual([]);

    // 「ジム」= 職場 と教える → resolveLearnedMoment
    const dict1 = learnPlace(dict0, 'ジム', 'work');
    m = resolveLearnedMoment(r.moments[0]);
    expect(m.state).toBe('armed');
    expect(m.learnedPlace).toBe(true);

    r = applySituation([m], { location: 'outside' }, enter('work'), dict1, 2);
    expect(r.firedIds).toEqual(['p']);
  });
});

describe('armMoment', () => {
  it('期限が読み取れた入力には時間バックストップが付く', () => {
    const dict = freshDict();
    const it0 = interpret('傘、大学に置いてきた 今日中に', dict);
    const m = armMoment(it0, it0.moments[0], dict, { id: 'x' })!;
    expect(m.timeBackstop).toBeTruthy();
  });

  it('組み込みラベル（スーパー）は learnedPlace 表示にしない', () => {
    const dict = freshDict();
    const it0 = interpret('牛乳なくなりそう', dict);
    const m = armMoment(it0, it0.moments[0], dict, { id: 'x' })!;
    expect(m.learnedPlace).toBe(false);
  });
});
