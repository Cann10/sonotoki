import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSonotoki } from './useSonotoki';

beforeEach(() => {
  localStorage.clear();
});

describe('useSonotoki — 審査員がなぞるデモの一本道', () => {
  it('入力 → 推論 → スーパー到着で発火 → [次のそのとき] → 再訪で再発火 → [やった]', () => {
    const { result } = renderHook(() => useSonotoki());

    act(() => result.current.actions.submit('牛乳なくなりそう'));
    expect(result.current.state.moments).toHaveLength(1);
    const id = result.current.state.moments[0].id;
    expect(result.current.state.moments[0].state).toBe('armed');
    expect(result.current.state.moments[0].humanLabel).toContain('スーパー');
    expect(result.current.state.lastInference?.needsConfirm).toBe(false);

    act(() => result.current.actions.sim({ type: 'enter', placeId: 'poi:grocery' }));
    expect(result.current.state.fireQueue).toEqual([id]);
    expect(result.current.state.moments[0].state).toBe('fired');

    act(() => result.current.actions.next(id));
    expect(result.current.state.fireQueue).toEqual([]);
    expect(result.current.state.moments[0].state).toBe('awaiting_next');

    act(() => result.current.actions.sim({ type: 'exit', placeId: 'poi:grocery' }));
    expect(result.current.state.moments[0].state).toBe('armed');

    act(() => result.current.actions.sim({ type: 'enter', placeId: 'poi:grocery' }));
    expect(result.current.state.fireQueue).toEqual([id]);
    expect(result.current.state.moments[0].firedCount).toBe(2);

    act(() => result.current.actions.done(id));
    expect(result.current.state.moments[0].state).toBe('done');
    expect(result.current.state.fireQueue).toEqual([]);
  });

  it('取り消すと、直前に作った Moment が消える', () => {
    const { result } = renderHook(() => useSonotoki());
    act(() => result.current.actions.submit('牛乳なくなりそう'));
    expect(result.current.state.moments).toHaveLength(1);
    act(() => result.current.actions.undoLast());
    expect(result.current.state.moments).toHaveLength(0);
    expect(result.current.state.lastInference).toBeNull();
  });

  it('候補を選び直すと Moment が差し替わる', () => {
    const { result } = renderHook(() => useSonotoki());
    act(() => result.current.actions.submit('傘、大学に置いてきた'));
    const id = result.current.state.moments[0].id;
    expect(result.current.state.moments[0].kind).toBe('place_departure');

    act(() => result.current.actions.repick(id, 1));
    expect(result.current.state.moments[0].id).toBe(id);
    expect(result.current.state.moments[0].kind).toBe('place_arrival');
  });

  it('状態は localStorage に保存され、次の読み込みで復元される', () => {
    const first = renderHook(() => useSonotoki());
    act(() => first.result.current.actions.submit('牛乳なくなりそう'));
    act(() => first.result.current.actions.sim({ type: 'enter', placeId: 'poi:grocery' }));

    const second = renderHook(() => useSonotoki());
    expect(second.result.current.state.moments).toHaveLength(1);
    expect(second.result.current.state.world.location).toBe('poi:grocery');
    // fireQueue は再構築しない（発火の再提示はしない）
    expect(second.result.current.state.fireQueue).toEqual([]);
  });

  it('Personal Place Dictionary: 初回は場所を尋ね、次回からは聞かずに理解する', () => {
    const { result } = renderHook(() => useSonotoki());

    // 1回目: 「ジム」は未知 → needs_place で、教えて待ち
    act(() => result.current.actions.submit('ジムに着いたらプロテイン'));
    const id = result.current.state.moments[0].id;
    expect(result.current.state.moments[0].state).toBe('needs_place');
    expect(result.current.state.lastInference?.teach?.phrase).toBe('ジム');

    // 状況を動かしても発火しない（まだ armed でない）
    act(() => result.current.actions.sim({ type: 'enter', placeId: 'work' }));
    expect(result.current.state.fireQueue).toEqual([]);
    // 教えて待ちのトーストは残る
    expect(result.current.state.lastInference?.teach?.phrase).toBe('ジム');

    // 「ジム」= 職場 と教える
    act(() => result.current.actions.teachPlace(id, 'work'));
    expect(result.current.state.moments[0].state).toBe('armed');
    expect(result.current.state.moments[0].trigger).toEqual({
      primitive: 'place_enter',
      placeId: 'work',
    });
    expect(result.current.state.moments[0].learnedPlace).toBe(true);
    expect(result.current.state.placeDict).toEqual({ ジム: 'work' });
    expect(result.current.state.lastInference?.learned).toEqual({ phrase: 'ジム', placeId: 'work' });

    // 職場に着けば発火する
    act(() => result.current.actions.sim({ type: 'exit', placeId: 'work' }));
    act(() => result.current.actions.sim({ type: 'enter', placeId: 'work' }));
    expect(result.current.state.fireQueue).toEqual([id]);

    // 2回目の入力: もう聞かない。即 armed で「覚えている」
    act(() => result.current.actions.done(id));
    act(() => result.current.actions.submit('ジム出たらストレッチ'));
    const m2 = result.current.state.moments[0];
    expect(m2.state).toBe('armed');
    expect(m2.learnedPlace).toBe(true);
    expect(m2.trigger).toEqual({ primitive: 'place_exit', placeId: 'work' });
    expect(result.current.state.lastInference?.teach).toBeUndefined();
  });

  it('学習した対応は localStorage に保存され、次回セッションで再利用される', () => {
    const first = renderHook(() => useSonotoki());
    act(() => first.result.current.actions.submit('図書館に行ったら予約本'));
    const id = first.result.current.state.moments[0].id;
    act(() => first.result.current.actions.teachPlace(id, 'poi:convenience'));

    const second = renderHook(() => useSonotoki());
    expect(second.result.current.state.placeDict).toEqual({ 図書館: 'poi:convenience' });
    act(() => second.result.current.actions.submit('図書館に着いたら勉強'));
    expect(second.result.current.state.moments[0].state).toBe('armed');
    expect(second.result.current.state.moments[0].learnedPlace).toBe(true);
    expect(second.result.current.state.moments[0].trigger).toEqual({
      primitive: 'place_enter',
      placeId: 'poi:convenience',
    });
  });

  it('forgetPlace で対応を忘れ、次回はまた尋ねる', () => {
    const { result } = renderHook(() => useSonotoki());
    act(() => result.current.actions.submit('ジムに着いたら'));
    act(() => result.current.actions.teachPlace(result.current.state.moments[0].id, 'work'));
    expect(result.current.state.placeDict).toEqual({ ジム: 'work' });

    act(() => result.current.actions.forgetPlace('ジム'));
    expect(result.current.state.placeDict).toEqual({});

    act(() => result.current.actions.submit('ジム出たらプロテイン'));
    expect(result.current.state.moments[0].state).toBe('needs_place');
  });

  it('最初から で全部消える', () => {
    const { result } = renderHook(() => useSonotoki());
    act(() => result.current.actions.submit('牛乳なくなりそう'));
    act(() => result.current.actions.sim({ type: 'time', timeBucket: 'this_evening' }));
    act(() => result.current.actions.submit('ジムに着いたら'));
    act(() => result.current.actions.teachPlace(result.current.state.moments[0].id, 'work'));
    act(() => result.current.actions.reset());
    expect(result.current.state.moments).toHaveLength(0);
    expect(result.current.state.world.location).toBe('outside');
    expect(result.current.state.placeDict).toEqual({});
    // 直後にエフェクトが空の状態を書き戻すので、中身が空であることを確認する
    const persisted = JSON.parse(localStorage.getItem('sonotoki.v1') ?? '{}');
    expect(persisted.moments).toEqual([]);
    expect(persisted.placeDict).toEqual({});
  });
});
