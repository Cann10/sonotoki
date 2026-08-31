import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLACE_DICT,
  dictEntries,
  forgetLabel,
  freshDict,
  isDefaultLabelKey,
  learnPlace,
  lookupPlaces,
  placeKey,
  removePlace,
} from './placeDictionary';

describe('placeKey — 表記ゆれを吸収する', () => {
  it('前後の空白と末尾の助詞を落とす', () => {
    expect(placeKey('  ジムに  ')).toBe('ジム');
    expect(placeKey('実家の')).toBe('実家');
    expect(placeKey('駅から')).toBe('駅');
  });
  it('「いつもの」「例の」などの接頭辞を落とす', () => {
    expect(placeKey('いつものカフェ')).toBe('カフェ');
    expect(placeKey('例の店')).toBe('店');
  });
});

describe('Personal Place Dictionary — 1 ラベル → 複数の実場所', () => {
  it('freshDict は組み込みラベルを1店ずつ持つ', () => {
    const d = freshDict();
    expect(d['スーパー']).toEqual(['poi:grocery']);
    expect(d['大学']).toEqual(['named:大学']);
    expect(d).not.toBe(DEFAULT_PLACE_DICT); // コピー
  });

  it('learnPlace は同じキーに実場所を足す（重複は無視）', () => {
    let d: ReturnType<typeof freshDict> = {};
    d = learnPlace(d, 'スーパー', 'poi:grocery');
    d = learnPlace(d, 'スーパー', 'poi:convenience'); // 別の店を足す
    d = learnPlace(d, 'スーパー', 'poi:grocery'); // 重複は無視
    expect(lookupPlaces(d, 'スーパー')).toEqual(['poi:grocery', 'poi:convenience']);
  });

  it('lookupPlaces は表記ゆれ込みで引ける。未知は空配列', () => {
    const d = learnPlace({}, 'ジム', 'work');
    expect(lookupPlaces(d, 'ジム')).toEqual(['work']);
    expect(lookupPlaces(d, 'いつものジム')).toEqual(['work']);
    expect(lookupPlaces(d, '図書館')).toEqual([]);
  });

  it('learnPlace は不変（新しいオブジェクトを返す）', () => {
    const a = {};
    const b = learnPlace(a, 'ジム', 'work');
    expect(a).toEqual({});
    expect(b).not.toBe(a);
  });

  it('removePlace は1店だけ外す。最後の1つを外すとラベルごと消える', () => {
    let d = learnPlace(learnPlace({}, 'スーパー', 'poi:grocery'), 'スーパー', 'poi:convenience');
    d = removePlace(d, 'スーパー', 'poi:grocery');
    expect(lookupPlaces(d, 'スーパー')).toEqual(['poi:convenience']);
    d = removePlace(d, 'スーパー', 'poi:convenience');
    expect('スーパー' in d).toBe(false);
  });

  it('forgetLabel はラベルごと消す', () => {
    const d = learnPlace({}, 'ジム', 'work');
    expect('ジム' in forgetLabel(d, 'ジム')).toBe(false);
  });

  it('isDefaultLabelKey / dictEntries', () => {
    expect(isDefaultLabelKey('スーパー')).toBe(true);
    expect(isDefaultLabelKey('ジム')).toBe(false);
    const entries = dictEntries(learnPlace(freshDict(), 'ジム', 'work'));
    expect(entries).toEqual(
      expect.arrayContaining([
        { key: 'スーパー', placeIds: ['poi:grocery'], isDefault: true },
        { key: 'ジム', placeIds: ['work'], isDefault: false },
      ]),
    );
  });
});
