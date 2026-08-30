// Personal Place Dictionary
//
// 「ユーザーの自然な呼び方 → 実際の場所」を学習して覚えておく仕組み。
// 一度対応づけたら保存し、次回同じ呼び方が出てきたら何も聞かずに再利用する。
// （お気に入り一覧ではなく、その人の語彙を覚えるのが目的）

import type { PlaceDict, PlaceId } from './types';

/** 表記ゆれを吸収した照合キー。全角/半角を揃え、前後の助詞や空白を落とす。 */
export function placeKey(phrase: string): string {
  let s = phrase.normalize('NFKC').trim().toLowerCase();
  s = s.replace(/^(その|あの|うちの|いつもの|例の)/, '');
  s = s.replace(/(の|へ|に|で|を|は|から|まで)$/, '');
  return s.trim();
}

export function lookupPlace(dict: PlaceDict, phrase: string): PlaceId | undefined {
  return dict[placeKey(phrase)];
}

export function learnPlace(dict: PlaceDict, phrase: string, placeId: PlaceId): PlaceDict {
  return { ...dict, [placeKey(phrase)]: placeId };
}

export function forgetPlace(dict: PlaceDict, phrase: string): PlaceDict {
  const key = placeKey(phrase);
  if (!(key in dict)) return dict;
  const next = { ...dict };
  delete next[key];
  return next;
}

export interface DictEntry {
  key: string;
  placeId: PlaceId;
}

export function dictEntries(dict: PlaceDict): DictEntry[] {
  return Object.entries(dict).map(([key, placeId]) => ({ key, placeId }));
}
