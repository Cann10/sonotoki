import { useEffect, useState } from 'react';
import type { EngineMoment } from '../domain';
import type { LastInference } from '../store/useSonotoki';

interface Props {
  inference: LastInference;
  moment: EngineMoment | null;
  onRepick: (candidateIndex: number) => void;
  onUndo: () => void;
  onDismiss: () => void;
}

export function InferenceToast({ inference, moment, onRepick, onUndo, onDismiss }: Props) {
  const [open, setOpen] = useState(inference.needsConfirm);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (inference.needsConfirm || open || hovered) return;
    const t = setTimeout(onDismiss, 12000);
    return () => clearTimeout(t);
  }, [inference, open, hovered, onDismiss]);

  if (!moment) return null;
  const candidates = inference.interpretation.moments.slice(0, 3);

  return (
    <div
      className={`toast${inference.needsConfirm ? ' toast--ask' : ''}`}
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
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
