// Per-browser persistence. Everything stays on the device (アカウント不要 / 完全ローカル).

import { freshDict } from './placeDictionary';
import type { EngineMoment } from './engine';
import type { PlaceDict, WorldState } from './types';

// v2: Personal Place Dictionary が 1ラベル → 複数場所（PlaceId[]）に変更。
// 旧 v1 データ（1:1）は互換性が無いので読み込まず、初期状態から始める。
const KEY = 'sonotoki.v2';

export interface PersistedState {
  moments: EngineMoment[];
  world: WorldState;
  /** placeKey → 登録済みの実場所群。 */
  placeDict: PlaceDict;
}

export const INITIAL_WORLD: WorldState = { location: 'outside' };

export function load(): PersistedState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (!parsed || !Array.isArray(parsed.moments) || !parsed.world) return null;
    const dict = parsed.placeDict;
    const valid = dict && Object.values(dict).every((v) => Array.isArray(v));
    return {
      moments: parsed.moments,
      world: parsed.world,
      placeDict: valid ? (dict as PlaceDict) : freshDict(),
    };
  } catch {
    return null;
  }
}

export function save(state: PersistedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // private mode / quota / disabled storage — the app still works this session.
  }
}

export function clear(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
