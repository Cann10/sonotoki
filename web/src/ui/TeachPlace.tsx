import { stripPlaces } from '../domain';
import type { PlaceId } from '../domain';

interface Props {
  phrase: string;
  onPick: (placeId: PlaceId) => void;
  compact?: boolean;
}

/** 「その呼び方、どこ?」を一度だけ尋ねる。選ばれた対応は辞書に保存される。 */
export function TeachPlace({ phrase, onPick, compact }: Props) {
  return (
    <div className={`teach${compact ? ' teach--compact' : ''}`}>
      <p className="teach__q">
        「<b>{phrase}</b>」ってどこ？ 一度だけ教えてください。
      </p>
      <div className="teach__places">
        {stripPlaces().map((p) => (
          <button
            key={p.id}
            type="button"
            className="teach__place"
            onClick={() => onPick(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
