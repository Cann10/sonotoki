import type { PlaceId } from './types';

export interface SimPlace {
  id: PlaceId;
  label: string;
  /** 状況シミュレーションの場所ストリップに出す順。無ければ非表示。 */
  stripOrder?: number;
}

/** シミュレーターが扱える場所。interpreter / resolver はここに無い場所を出さない。 */
export const SIM_PLACES: SimPlace[] = [
  { id: 'poi:grocery', label: 'スーパー', stripOrder: 1 },
  { id: 'poi:convenience', label: 'コンビニ', stripOrder: 2 },
  { id: 'poi:pharmacy', label: '薬局', stripOrder: 3 },
  { id: 'named:大学', label: '大学', stripOrder: 4 },
  { id: 'work', label: '職場', stripOrder: 5 },
  { id: 'home', label: '家', stripOrder: 6 },
];

const BY_ID = new Map(SIM_PLACES.map((p) => [p.id, p]));

export function placeLabel(id: PlaceId): string {
  const known = BY_ID.get(id);
  if (known) return known.label;
  if (id.startsWith('named:')) return id.slice('named:'.length);
  return id;
}

export function stripPlaces(): SimPlace[] {
  return SIM_PLACES.filter((p) => p.stripOrder != null).sort(
    (a, b) => (a.stripOrder ?? 0) - (b.stripOrder ?? 0),
  );
}

export function isSimulatable(id: PlaceId): boolean {
  return BY_ID.has(id);
}

export const TIME_BUCKET_LABEL: Record<string, string> = {
  this_evening: '夕方',
  tomorrow_morning: '翌朝',
};
