import { useMemo, useState } from 'react';
import { interpret, type EngineMoment } from '../domain';

interface Props {
  moments: EngineMoment[];
  onRepick: (id: string, candidateIndex: number) => void;
  onRemove: (id: string) => void;
}

const SECTIONS: { key: string; title: string; match: (m: EngineMoment) => boolean }[] = [
  {
    key: 'waiting',
    title: '待っているそのとき',
    match: (m) => m.state === 'armed' || m.state === 'fired',
  },
  { key: 'again', title: '次のそのとき待ち', match: (m) => m.state === 'awaiting_next' },
  { key: 'done', title: 'すんだこと', match: (m) => m.state === 'done' },
];

export function MomentList({ moments, onRepick, onRemove }: Props) {
  if (moments.length === 0) return null;

  return (
    <div className="moment-list">
      {SECTIONS.map((section) => {
        const items = moments.filter(section.match);
        if (items.length === 0) return null;
        return (
          <section key={section.key} className="moment-list__section">
            <h2 className="moment-list__heading">
              {section.title}
              <span className="moment-list__count">{items.length}</span>
            </h2>
            <ul className="moment-list__items">
              {items.map((m) => (
                <li key={m.id}>
                  <MomentCard moment={m} onRepick={onRepick} onRemove={onRemove} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function MomentCard({
  moment,
  onRepick,
  onRemove,
}: {
  moment: EngineMoment;
  onRepick: (id: string, candidateIndex: number) => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const done = moment.state === 'done';
  const waitingAgain = moment.state === 'awaiting_next';

  const candidates = useMemo(
    () => (editing ? interpret(moment.originalText).moments.slice(0, 3) : []),
    [editing, moment.originalText],
  );

  return (
    <article className={`memo${done ? ' memo--done' : ''}${waitingAgain ? ' memo--again' : ''}`}>
      <p className="memo__text">{moment.originalText}</p>

      <div className="memo__thread" aria-hidden="true">
        <span className="memo__thread-line" />
      </div>

      <div className="memo__moment">
        <span className="memo__moment-label">{moment.humanLabel}</span>
        <span className="memo__tags">
          {moment.recurring && <span className="tag tag--loop">くりかえし</span>}
          {moment.firedCount > 0 && (
            <span className="tag tag--count">{moment.firedCount}回 戻ってきた</span>
          )}
          {moment.timeBackstop && <span className="tag">時間でも念のため</span>}
          {moment.lowConfidence && !done && <span className="tag tag--unsure">AIが迷っています</span>}
        </span>
      </div>

      {!done && (
        <div className="memo__tools">
          <button type="button" className="memo__tool" onClick={() => setEditing((v) => !v)}>
            直す
          </button>
          <button type="button" className="memo__tool" onClick={() => onRemove(moment.id)}>
            やめる
          </button>
        </div>
      )}

      {editing && candidates.length > 0 && (
        <ul className="memo__candidates">
          {candidates.map((c, i) => {
            const active = c.humanLabel === moment.humanLabel;
            return (
              <li key={`${c.humanLabel}-${i}`}>
                <button
                  type="button"
                  className={`memo__cand${active ? ' is-active' : ''}`}
                  onClick={() => {
                    onRepick(moment.id, i);
                    setEditing(false);
                  }}
                >
                  <span>{c.humanLabel}</span>
                  <span className="memo__conf">{Math.round(c.confidence * 100)}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
