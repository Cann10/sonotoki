import { describe, expect, it } from 'vitest';
import { dictEntries, forgetPlace, learnPlace, lookupPlace, placeKey } from './placeDictionary';

describe('placeKey — 表記ゆれを吸収する', () => {
  it('前後の空白と末尾の助詞を落とす', () => {
    expect(placeKey('  ジムに  ')).toBe('ジム');
    expect(placeKey('実家の')).toBe('実家');
  });
  it('「いつもの」「例の」などの接頭辞を落とす', () => {
    expect(placeKey('いつものカフェ')).toBe('カフェ');
    expect(placeKey('例の店')).toBe('店');
  });
  it('全角英数を半角化し、英字は小文字化する', () => {
    expect(placeKey('ＧＹＭ')).toBe('gym');
  });
});

describe('Personal Place Dictionary', () => {
  it('learn した対応を lookup で引ける（表記ゆれ込み）', () => {
    const d = learnPlace({}, 'ジム', 'work');
    expect(lookupPlace(d, 'ジム')).toBe('work');
    expect(lookupPlace(d, 'ジムに')).toBe('work');
    expect(lookupPlace(d, 'いつものジム')).toBe('work');
  });

  it('未知の呼び方は undefined', () => {
    expect(lookupPlace({}, '図書館')).toBeUndefined();
  });

  it('learn は不変（新しいオブジェクトを返す）', () => {
    const a = {};
    const b = learnPlace(a, 'ジム', 'work');
    expect(a).toEqual({});
    expect(b).not.toBe(a);
  });

  it('forget で対応が消える', () => {
    const d = learnPlace({}, 'ジム', 'work');
    expect(lookupPlace(forgetPlace(d, 'ジム'), 'ジム')).toBeUndefined();
  });

  it('entries で一覧を取れる', () => {
    const d = learnPlace(learnPlace({}, 'ジム', 'work'), '実家', 'home');
    expect(dictEntries(d)).toEqual(
      expect.arrayContaining([
        { key: 'ジム', placeId: 'work' },
        { key: '実家', placeId: 'home' },
      ]),
    );
  });
});
