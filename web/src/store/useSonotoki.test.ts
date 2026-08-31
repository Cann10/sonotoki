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
    const id = result.current.state.moments[0].id;
    expect(result.current.state.moments[0].state).toBe('armed'); // スーパーは seed 済み
    expect(result.current.state.moments[0].trigger).toEqual({
      primitive: 'place_enter',
      ref: { kind: 'label', key: 'スーパー' },
    });

    act(() => result.current.actions.sim({ type: 'enter', placeId: 'poi:grocery' }));
    expect(result.current.state.fireQueue).toEqual([id]);

    act(() => result.current.actions.next(id));
    expect(result.current.state.moments[0].state).toBe('awaiting_next');

    act(() => result.current.actions.sim({ type: 'exit', placeId: 'poi:grocery' }));
    expect(result.current.state.moments[0].state).toBe('armed');

    act(() => result.current.actions.sim({ type: 'enter', placeId: 'poi:grocery' }));
    expect(result.current.state.fireQueue).toEqual([id]);
    expect(result.current.state.moments[0].firedCount).toBe(2);

    act(() => result.current.actions.done(id));
    expect(result.current.state.moments[0].state).toBe('done');
  });

  it('取り消すと、直前に作った Moment が消える', () => {
    const { result } = renderHook(() => useSonotoki());
    act(() => result.current.actions.submit('牛乳なくなりそう'));
    act(() => result.current.actions.undoLast());
    expect(result.current.state.moments).toHaveLength(0);
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

  it('状態は localStorage(v2) に保存され、次の読み込みで復元される', () => {
    const first = renderHook(() => useSonotoki());
    act(() => first.result.current.actions.submit('牛乳なくなりそう'));
    act(() => first.result.current.actions.sim({ type: 'enter', placeId: 'poi:grocery' }));

    const second = renderHook(() => useSonotoki());
    expect(second.result.current.state.moments).toHaveLength(1);
    expect(second.result.current.state.world.location).toBe('poi:grocery');
    expect(second.result.current.state.fireQueue).toEqual([]);
  });
});

describe('useSonotoki — Personal Place Dictionary（1ラベル → 複数店舗）', () => {
  it('初回は場所を尋ね、次回からは聞かずに理解する', () => {
    const { result } = renderHook(() => useSonotoki());

    act(() => result.current.actions.submit('ジムに着いたらプロテイン'));
    const id = result.current.state.moments[0].id;
    expect(result.current.state.moments[0].state).toBe('needs_place');
    expect(result.current.state.lastInference?.teach?.phrase).toBe('ジム');

    act(() => result.current.actions.sim({ type: 'enter', placeId: 'work' }));
    expect(result.current.state.fireQueue).toEqual([]);

    act(() => result.current.actions.teachPlace(id, 'work'));
    expect(result.current.state.moments[0].state).toBe('armed');
    expect(result.current.state.moments[0].trigger).toEqual({
      primitive: 'place_enter',
      ref: { kind: 'label', key: 'ジム' },
    });
    expect(result.current.state.moments[0].learnedPlace).toBe(true);
    expect(result.current.state.placeDict['ジム']).toEqual(['work']);
    expect(result.current.state.lastInference?.learned).toEqual({ phrase: 'ジム', placeId: 'work' });

    act(() => result.current.actions.sim({ type: 'exit', placeId: 'work' }));
    act(() => result.current.actions.sim({ type: 'enter', placeId: 'work' }));
    expect(result.current.state.fireQueue).toEqual([id]);

    act(() => result.current.actions.done(id));
    act(() => result.current.actions.submit('ジム出たらストレッチ'));
    const m2 = result.current.state.moments[0];
    expect(m2.state).toBe('armed');
    expect(m2.learnedPlace).toBe(true);
    expect(m2.trigger).toEqual({ primitive: 'place_exit', ref: { kind: 'label', key: 'ジム' } });
  });

  it('1つの意味ラベルに店を足すと、どちらの店に着いても発火する', () => {
    const { result } = renderHook(() => useSonotoki());
    act(() => result.current.actions.submit('牛乳なくなりそう'));
    const id = result.current.state.moments[0].id;

    // 「スーパー」にコンビニも足す
    act(() => result.current.actions.addPlace('スーパー', 'poi:convenience'));
    expect(result.current.state.placeDict['スーパー']).toEqual(['poi:grocery', 'poi:convenience']);

    act(() => result.current.actions.sim({ type: 'enter', placeId: 'poi:convenience' }));
    expect(result.current.state.fireQueue).toEqual([id]); // 足した店でも鳴る
  });

  it('ラベルの店を全部外すと、そのメモは「場所を教えて」に戻る', () => {
    const { result } = renderHook(() => useSonotoki());
    act(() => result.current.actions.submit('牛乳なくなりそう'));
    expect(result.current.state.moments[0].state).toBe('armed');

    act(() => result.current.actions.removePlace('スーパー', 'poi:grocery'));
    expect('スーパー' in result.current.state.placeDict).toBe(false);
    expect(result.current.state.moments[0].state).toBe('needs_place');

    // 別の店を足すと armed に戻る
    act(() => result.current.actions.addPlace('スーパー', 'poi:convenience'));
    expect(result.current.state.moments[0].state).toBe('armed');
  });

  it('学習した対応は localStorage に保存され、次回セッションで再利用される', () => {
    const first = renderHook(() => useSonotoki());
    act(() => first.result.current.actions.submit('図書館に行ったら予約本'));
    const id = first.result.current.state.moments[0].id;
    act(() => first.result.current.actions.teachPlace(id, 'poi:convenience'));

    const second = renderHook(() => useSonotoki());
    expect(second.result.current.state.placeDict['図書館']).toEqual(['poi:convenience']);
    act(() => second.result.current.actions.submit('図書館に着いたら勉強'));
    expect(second.result.current.state.moments[0].state).toBe('armed');
    expect(second.result.current.state.moments[0].learnedPlace).toBe(true);
  });

  it('forgetLabel で対応を忘れ、次回はまた尋ねる', () => {
    const { result } = renderHook(() => useSonotoki());
    act(() => result.current.actions.submit('ジムに着いたら'));
    act(() => result.current.actions.teachPlace(result.current.state.moments[0].id, 'work'));
    expect(result.current.state.placeDict['ジム']).toEqual(['work']);

    act(() => result.current.actions.forgetLabel('ジム'));
    expect('ジム' in result.current.state.placeDict).toBe(false);

    act(() => result.current.actions.submit('ジム出たらプロテイン'));
    expect(result.current.state.moments[0].state).toBe('needs_place');
  });

  it('最初から で Moment は消え、辞書は組み込みラベルに戻る', () => {
    const { result } = renderHook(() => useSonotoki());
    act(() => result.current.actions.submit('牛乳なくなりそう'));
    act(() => result.current.actions.submit('ジムに着いたら'));
    act(() => result.current.actions.teachPlace(result.current.state.moments[0].id, 'work'));
    act(() => result.current.actions.reset());
    expect(result.current.state.moments).toHaveLength(0);
    expect(result.current.state.world.location).toBe('outside');
    expect(result.current.state.placeDict['スーパー']).toEqual(['poi:grocery']);
    expect('ジム' in result.current.state.placeDict).toBe(false);
  });
});
