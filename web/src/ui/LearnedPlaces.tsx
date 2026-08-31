import { useState } from 'react';
import { dictEntries, placeLabel, stripPlaces } from '../domain';
import type { PlaceDict, PlaceId } from '../domain';
import { Icon } from './Icon';

interface Props {
  dict: PlaceDict;
  /** いま使われている（armed 等の）意味ラベル。組み込みでも表示して店を足せるように。 */
  activeLabelKeys: Set<string>;
  onAddPlace: (labelKey: string, placeId: PlaceId) => void;
  onRemovePlace: (labelKey: string, placeId: PlaceId) => void;
  onForgetLabel: (labelKey: string) => void;
}

/** 覚えた「呼び方 → 複数の場所」。使うほど育つのがひと目で分かる。 */
export function LearnedPlaces({
  dict,
  activeLabelKeys,
  onAddPlace,
  onRemovePlace,
  onForgetLabel,
}: Props) {
  const [adding, setAdding] = useState<string | null>(null);

  // 初期状態（組み込みラベルが1店ずつ・未使用）は隠す。使ったもの／育ったものを見せる。
  const entries = dictEntries(dict).filter(
    (e) => !e.isDefault || e.placeIds.length > 1 || activeLabelKeys.has(e.key),
  );
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
            <span className="learned__places">
              {e.placeIds.map((pid) => (
                <span key={pid} className="learned__place">
                  {placeLabel(pid)}
                  <button
                    type="button"
                    className="learned__remove"
                    aria-label={`「${e.key}」から ${placeLabel(pid)} を外す`}
                    onClick={() => onRemovePlace(e.key, pid)}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </span>
              ))}
              <button
                type="button"
                className="learned__add"
                onClick={() => setAdding(adding === e.key ? null : e.key)}
              >
                <Icon name="plus" size={12} />
                場所
              </button>
            </span>
            {!e.isDefault && (
              <button
                type="button"
                className="learned__forget"
                aria-label={`「${e.key}」を忘れる`}
                onClick={() => onForgetLabel(e.key)}
              >
                忘れる
              </button>
            )}
            {adding === e.key && (
              <span className="learned__picker teach teach--compact">
                {stripPlaces()
                  .filter((p) => !e.placeIds.includes(p.id))
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="teach__place"
                      onClick={() => {
                        onAddPlace(e.key, p.id);
                        setAdding(null);
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
