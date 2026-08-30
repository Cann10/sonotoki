import { useState } from 'react';
import { placeLabel, type EngineMoment, type PlaceId } from '../domain';
import type { LastInference } from '../store/useSonotoki';
import { TeachPlace } from './TeachPlace';

interface Props {
  inference: LastInference;
  moment: EngineMoment | null;
  onRepick: (candidateIndex: number) => void;
  onTeach: (placeId: PlaceId) => void;
  onUndo: () => void;
  onDismiss: () => void;
}

export function InferenceToast({
  inference,
  moment,
  onRepick,
  onTeach,
  onUndo,
  onDismiss,
}: Props) {
  const [open, setOpen] = useState(inference.needsConfirm);

  if (!moment) return null;

  // 独自の場所を一度だけ教えてもらうモード
  if (inference.teach) {
    return (
      <div className="toast toast--ask" role="status">
        <button type="button" className="toast__close" aria-label="閉じる" onClick={onUndo}>
          ×
        </button>
        <TeachPlace phrase={inference.teach.phrase} onPick={onTeach} />
      </div>
    );
  }

  const candidates = inference.interpretation.moments.slice(0, 3);

  return (
    <div className={`toast${inference.needsConfirm ? ' toast--ask' : ''}`} role="status">
      <button type="button" className="toast__close" aria-label="閉じる" onClick={onDismiss}>
        ×
      </button>
      <div className="toast__main">
        <span className="toast__mark" aria-hidden="true">
          ▸
        </span>
        <div>
          <p className="toast__headline">
            {inference.needsConfirm ? 'たぶん、' : ''}
            <strong>{moment.humanLabel}</strong>
            {inference.needsConfirm ? ' でいい?' : ' に戻します'}
          </p>
          {inference.learned && (
            <p className="toast__learned">
              「{inference.learned.phrase}」= {placeLabel(inference.learned.placeId)} として覚えました
            </p>
          )}
          {!inference.learned && moment.learnedPlace && moment.placePhrase && (
            <p className="toast__learned">
              「{moment.placePhrase}」= {triggerPlaceLabel(moment)} と覚えています
            </p>
          )}
          {inference.needsConfirm && inference.interpretation.ambiguityNote && (
            <p className="toast__note">{inference.interpretation.ambiguityNote}</p>
          )}
        </div>
      </div>

      <div className="toast__actions">
        {!inference.needsConfirm && (
          <button type="button" className="toast__link" onClick={() => setOpen((v) => !v)}>
            ちがう
          </button>
        )}
        <button type="button" className="toast__link" onClick={onUndo}>
          取り消す
        </button>
      </div>

      {(open || inference.needsConfirm) && candidates.length > 1 && (
        <ul className="toast__candidates">
          {candidates.map((c, i) => {
            const active = c.humanLabel === moment.humanLabel;
            return (
              <li key={`${c.humanLabel}-${i}`}>
                <button
                  type="button"
                  className={`toast__cand${active ? ' is-active' : ''}`}
                  onClick={() => {
                    onRepick(i);
                    setOpen(false);
                  }}
                >
                  <span>{c.humanLabel}</span>
                  <span className="toast__conf">{Math.round(c.confidence * 100)}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function triggerPlaceLabel(m: EngineMoment): string {
  return m.trigger.primitive === 'time' ? '' : placeLabel(m.trigger.placeId);
}
