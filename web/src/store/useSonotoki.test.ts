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

  it('最初から で全部消える', () => {
    const { result } = renderHook(() => useSonotoki());
    act(() => result.current.actions.submit('牛乳なくなりそう'));
    act(() => result.current.actions.sim({ type: 'time', timeBucket: 'this_evening' }));
    act(() => result.current.actions.reset());
    expect(result.current.state.moments).toHaveLength(0);
    expect(result.current.state.world.location).toBe('outside');
    // 直後にエフェクトが空の状態を書き戻すので、中身が空であることを確認する
    const persisted = JSON.parse(localStorage.getItem('sonotoki.v1') ?? '{}');
    expect(persisted.moments).toEqual([]);
  });
});
