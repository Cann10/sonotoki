// Personal Place Dictionary — 1 意味ラベル → 複数の実場所。
//
// 「ユーザーの自然な呼び方 → 実際の場所（複数可）」を覚える。使うほど育つ。
// 初回に全部登録させず、必要になった場所だけ足していく。
// Moment は semantic な placeKey だけ持ち、Resolver が登録済みの複数場所へ展開する。

import type { PlaceDict, PlaceId } from './types';

/** 照合キー。NFKC → 小文字 → 先頭の連体詞・末尾助詞を落とす。 */
export function placeKey(phrase: string): string {
  let s = phrase.normalize('NFKC').trim().toLowerCase();
  s = s.replace(/^(その|あの|うちの|いつもの|例の)/, '');
  s = s.replace(/(の|へ|に|で|を|は|から|まで)$/, '');
  return s.trim();
}

/** 組み込みの意味ラベルの初期値（既存フローを壊さないためのシード）。 */
export const DEFAULT_PLACE_DICT: PlaceDict = {
  スーパー: ['poi:grocery'],
  コンビニ: ['poi:convenience'],
  薬局: ['poi:pharmacy'],
  大学: ['named:大学'],
};

const DEFAULT_KEYS = new Set(Object.keys(DEFAULT_PLACE_DICT));

/** 組み込みのラベルか（＝「覚えています」を表示しない）。 */
export function isDefaultLabelKey(key: string): boolean {
  return DEFAULT_KEYS.has(key);
}

export function freshDict(): PlaceDict {
  const d: PlaceDict = {};
  for (const [k, v] of Object.entries(DEFAULT_PLACE_DICT)) d[k] = [...v];
  return d;
}

/** その呼び方に登録された実場所（0件なら「どこ?」と尋ねる合図）。 */
export function lookupPlaces(dict: PlaceDict, phrase: string): PlaceId[] {
  return dict[placeKey(phrase)] ?? [];
}

/** 呼び方に実場所を1つ足す（重複は無視）。ラベルが無ければ作る。 */
export function learnPlace(dict: PlaceDict, phrase: string, placeId: PlaceId): PlaceDict {
  const key = placeKey(phrase);
  const cur = dict[key] ?? [];
  if (cur.includes(placeId)) return dict;
  return { ...dict, [key]: [...cur, placeId] };
}

/** 呼び方から実場所を1つ外す。最後の1つを外すとラベルごと消える。 */
export function removePlace(dict: PlaceDict, phrase: string, placeId: PlaceId): PlaceDict {
  const key = placeKey(phrase);
  const cur = dict[key];
  if (!cur) return dict;
  const next = cur.filter((p) => p !== placeId);
  if (next.length === cur.length) return dict;
  const copy = { ...dict };
  if (next.length === 0) delete copy[key];
  else copy[key] = next;
  return copy;
}

/** 呼び方ごと忘れる。 */
export function forgetLabel(dict: PlaceDict, phrase: string): PlaceDict {
  const key = placeKey(phrase);
  if (!(key in dict)) return dict;
  const copy = { ...dict };
  delete copy[key];
  return copy;
}

export interface DictEntry {
  key: string;
  placeIds: PlaceId[];
  isDefault: boolean;
}

export function dictEntries(dict: PlaceDict): DictEntry[] {
  return Object.entries(dict).map(([key, placeIds]) => ({
    key,
    placeIds,
    isDefault: isDefaultLabelKey(key),
  }));
}
