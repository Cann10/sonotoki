// Per-browser persistence. Everything stays on the device (plan: アカウント不要 / 完全ローカル).

import type { EngineMoment } from './engine';
import type { PlaceDict, WorldState } from './types';

const KEY = 'sonotoki.v1';

export interface PersistedState {
  moments: EngineMoment[];
  world: WorldState;
  /** Personal Place Dictionary: ユーザーの呼び方 → 実際の場所。 */
  placeDict: PlaceDict;
}

export const INITIAL_WORLD: WorldState = { location: 'outside' };

export function load(): PersistedState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (!parsed || !Array.isArray(parsed.moments) || !parsed.world) return null;
    return {
      moments: parsed.moments,
      world: parsed.world,
      placeDict: parsed.placeDict ?? {}, // 旧データには無い
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
