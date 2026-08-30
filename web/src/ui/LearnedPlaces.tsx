import { dictEntries, placeLabel } from '../domain';
import type { PlaceDict } from '../domain';

interface Props {
  dict: PlaceDict;
  onForget: (phrase: string) => void;
}

/** 覚えた「呼び方 → 場所」の一覧。成長がひと目で分かるようにする。 */
export function LearnedPlaces({ dict, onForget }: Props) {
  const entries = dictEntries(dict);
  if (entries.length === 0) return null;

  return (
    <section className="learned">
      <h2 className="learned__title">
        覚えた場所 <span className="learned__count">{entries.length}</span>
      </h2>
      <ul className="learned__list">
        {entries.map((e) => (
          <li key={e.key} className="learned__item">
            <span className="learned__phrase">{e.key}</span>
            <span className="learned__arrow">→</span>
            <span className="learned__place">{placeLabel(e.placeId)}</span>
            <button
              type="button"
              className="learned__forget"
              aria-label={`「${e.key}」を忘れる`}
              onClick={() => onForget(e.key)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
