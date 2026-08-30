import { useMemo, useState } from 'react';
import './ui/ui.css';
import type { EngineMoment } from './domain';
import { useSonotoki } from './store/useSonotoki';
import { NoteInput } from './ui/NoteInput';
import { InferenceToast } from './ui/InferenceToast';
import { MomentList } from './ui/MomentList';
import { WorldSim } from './ui/WorldSim';
import { SonotokiMoment } from './ui/SonotokiMoment';

function placeOf(m: EngineMoment): string | null {
  return m.trigger.primitive === 'time' ? null : m.trigger.placeId;
}

export default function App() {
  const { state, actions } = useSonotoki();
  const [confirmReset, setConfirmReset] = useState(false);

  const waitingByPlace = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of state.moments) {
      if (m.state !== 'armed' && m.state !== 'awaiting_next' && m.state !== 'fired') continue;
      const place = placeOf(m);
      if (place) counts[place] = (counts[place] ?? 0) + 1;
    }
    return counts;
  }, [state.moments]);

  const firedId = state.fireQueue[0];
  const firedMoment = firedId ? state.moments.find((m) => m.id === firedId) ?? null : null;
  const lastMoment = state.lastInference
    ? state.moments.find((m) => m.id === state.lastInference!.momentId) ?? null
    : null;

  return (
    <div className="app">
      <header className="masthead">
        <div className="wordmark">そのとき</div>
        <p className="thesis">
          覚えておかなくていいメモ。書くのは<b>“何を”</b>だけ。
          <b>“いつ・どこで”</b>は、そのときが決めます。
        </p>
      </header>

      <main className="stage">
        <section className="compose">
          <NoteInput onSubmit={actions.submit} />
          {state.lastInference && (
            <InferenceToast
              inference={state.lastInference}
              moment={lastMoment}
              onRepick={(i) => actions.repick(state.lastInference!.momentId, i)}
              onUndo={actions.undoLast}
              onDismiss={actions.dismissToast}
            />
          )}
        </section>

        <MomentList
          moments={state.moments}
          onRepick={actions.repick}
          onRemove={actions.remove}
        />

        {state.moments.length > 0 && (
          <footer className="app__foot">
            <p>
              Heroes League 向けの Web プロトタイプ。位置通知は端末では OS が担いますが、ここでは
              下の「状況シミュレーション」で体験を再現しています。
            </p>
            <button
              type="button"
              className="app__reset"
              onClick={() => {
                if (confirmReset) {
                  actions.reset();
                  setConfirmReset(false);
                } else {
                  setConfirmReset(true);
                }
              }}
              onBlur={() => setConfirmReset(false)}
            >
              {confirmReset ? 'ほんとうに全部消す' : '最初から'}
            </button>
          </footer>
        )}
      </main>

      <WorldSim world={state.world} waitingByPlace={waitingByPlace} onEvent={actions.sim} />

      {firedMoment && (
        <SonotokiMoment
          moment={firedMoment}
          queueRemaining={state.fireQueue.length - 1}
          onDone={() => actions.done(firedMoment.id)}
          onNext={() => actions.next(firedMoment.id)}
        />
      )}
    </div>
  );
}
