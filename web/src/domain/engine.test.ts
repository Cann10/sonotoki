import { beforeEach, describe, expect, it } from 'vitest';
import {
  applySituation,
  armMoment,
  markDone,
  markNext,
  type EngineMoment,
} from './engine';
import { interpret } from './interpreter';
import { INITIAL_WORLD } from './storage';
import type { PlaceId, SituationEvent, WorldState } from './types';

function arm(text: string, id: string): EngineMoment {
  const interpretation = interpret(text);
  const m = armMoment(interpretation, interpretation.moments[0], { id, now: 0 });
  if (!m) throw new Error(`could not arm: ${text}`);
  return m;
}

const enter = (placeId: PlaceId): SituationEvent => ({ type: 'enter', placeId });
const exit = (placeId: PlaceId): SituationEvent => ({ type: 'exit', placeId });

describe('trigger engine — arm → fire → [やった] / [次のそのとき]', () => {
  let moments: EngineMoment[];
  let world: WorldState;

  beforeEach(() => {
    moments = [arm('牛乳なくなりそう', 'milk')];
    world = { ...INITIAL_WORLD };
  });

  it('スーパーに着くと発火する', () => {
    const r = applySituation(moments, world, enter('poi:grocery'), 1);
    expect(r.firedIds).toEqual(['milk']);
    expect(r.moments[0].state).toBe('fired');
    expect(r.moments[0].firedCount).toBe(1);
    expect(r.world.location).toBe('poi:grocery');
  });

  it('関係ない場所では発火しない', () => {
    const r = applySituation(moments, world, enter('named:大学'), 1);
    expect(r.firedIds).toEqual([]);
    expect(r.moments[0].state).toBe('armed');
  });

  it('[やった] のあとは同じ場所に再訪しても二度と鳴らない', () => {
    let r = applySituation(moments, world, enter('poi:grocery'), 1);
    r = { ...r, moments: markDone(r.moments, 'milk') };
    expect(r.moments[0].state).toBe('done');

    r = applySituation(r.moments, r.world, exit('poi:grocery'), 2);
    r = applySituation(r.moments, r.world, enter('poi:grocery'), 3);
    expect(r.firedIds).toEqual([]);
    expect(r.moments[0].state).toBe('done');
  });

  it('[次のそのとき] は時間スヌーズではなく、店を出て再訪したときに再武装・再発火する', () => {
    // 1回目の発火
    let r = applySituation(moments, world, enter('poi:grocery'), 1);
    expect(r.firedIds).toEqual(['milk']);

    // 店内にいるまま [次のそのとき] → まだ状況の中なので awaiting_next
    r = { ...r, moments: markNext(r.moments, r.world, 'milk') };
    expect(r.moments[0].state).toBe('awaiting_next');

    // 店内での再入店イベントでは鳴らない
    r = applySituation(r.moments, r.world, enter('poi:grocery'), 2);
    expect(r.firedIds).toEqual([]);

    // 店を出る → 状況から抜けたので armed に戻る
    r = applySituation(r.moments, r.world, exit('poi:grocery'), 3);
    expect(r.moments[0].state).toBe('armed');

    // 次にスーパーに着く → 再発火
    r = applySituation(r.moments, r.world, enter('poi:grocery'), 4);
    expect(r.firedIds).toEqual(['milk']);
    expect(r.moments[0].firedCount).toBe(2);
  });

  it('店を出た後に [次のそのとき] を押すと即 armed（状況の外なので待たない）', () => {
    let r = applySituation(moments, world, enter('poi:grocery'), 1);
    r = applySituation(r.moments, r.world, exit('poi:grocery'), 2);
    // fired のまま外に出た状態で [次のそのとき]
    r = { ...r, moments: markNext(r.moments, r.world, 'milk') };
    expect(r.moments[0].state).toBe('armed');
  });

  it('退出トリガー：大学を出るときに発火し、再訪→再退出で再発火する', () => {
    const ms = [arm('傘、大学に置いてきた', 'umb')];
    let r = applySituation(ms, { location: 'outside' }, enter('named:大学'), 1);
    expect(r.firedIds).toEqual([]); // 着いただけでは鳴らない

    r = applySituation(r.moments, r.world, exit('named:大学'), 2);
    expect(r.firedIds).toEqual(['umb']);

    r = { ...r, moments: markNext(r.moments, r.world, 'umb') };
    r = applySituation(r.moments, r.world, enter('named:大学'), 3);
    r = applySituation(r.moments, r.world, exit('named:大学'), 4);
    expect(r.firedIds).toEqual(['umb']);
    expect(r.moments[0].firedCount).toBe(2);
  });

  it('同じイベントで「状況から抜けて再武装」した Moment は、その場では発火しない', () => {
    // awaiting_next の退出トリガーが大学にいる状態から、退出イベント1発で
    // 再武装＋発火してしまわないこと（次の退出で初めて鳴る）
    const m: EngineMoment = {
      ...arm('傘、大学に置いてきた', 'umb'),
      state: 'awaiting_next',
    };
    let r = applySituation([m], { location: 'named:大学' }, exit('named:大学'), 1);
    expect(r.moments[0].state).toBe('armed');
    expect(r.firedIds).toEqual([]);

    r = applySituation(r.moments, r.world, enter('named:大学'), 2);
    r = applySituation(r.moments, r.world, exit('named:大学'), 3);
    expect(r.firedIds).toEqual(['umb']);
  });

  it('複数の待機中 Moment が同じイベントで同時に発火する', () => {
    const ms = [arm('牛乳なくなりそう', 'milk'), arm('卵も買う', 'egg')];
    const r = applySituation(ms, { location: 'outside' }, enter('poi:grocery'), 1);
    expect(new Set(r.firedIds)).toEqual(new Set(['milk', 'egg']));
  });

  it('時間トリガー：夕方で発火、別の時間帯を挟んで再度夕方で再発火', () => {
    const interpretation = interpret('今日中に郵便出す');
    const m = armMoment(interpretation, interpretation.moments[0], { id: 'mail', now: 0 })!;
    let r = applySituation([m], { location: 'outside' }, { type: 'time', timeBucket: 'this_evening' }, 1);
    expect(r.firedIds).toEqual(['mail']);

    r = { ...r, moments: markNext(r.moments, r.world, 'mail') };
    expect(r.moments[0].state).toBe('awaiting_next');

    r = applySituation(r.moments, r.world, { type: 'time', timeBucket: 'tomorrow_morning' }, 2);
    expect(r.moments[0].state).toBe('armed');

    r = applySituation(r.moments, r.world, { type: 'time', timeBucket: 'this_evening' }, 3);
    expect(r.firedIds).toEqual(['mail']);
  });
});

describe('armMoment', () => {
  it('期限が読み取れた入力には時間バックストップが付く', () => {
    const interpretation = interpret('傘、大学に置いてきた 今日中に');
    const m = armMoment(interpretation, interpretation.moments[0], { id: 'x' })!;
    expect(m.timeBackstop).toBeTruthy();
  });

  it('ふつうの位置 Moment には時間バックストップを付けない', () => {
    const interpretation = interpret('牛乳なくなりそう');
    const m = armMoment(interpretation, interpretation.moments[0], { id: 'x' })!;
    expect(m.timeBackstop).toBeUndefined();
  });

  it('解決できない候補では null を返す', () => {
    const interpretation = interpret('牛乳なくなりそう');
    const bogus = { ...interpretation.moments[0], kind: 'place_arrival' as const, poiCategory: undefined, placeLabel: '実家', placeKind: 'named_place' as const };
    expect(armMoment(interpretation, bogus, { id: 'x' })).toBeNull();
  });
});
