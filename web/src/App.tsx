import { useMemo, useState } from 'react';
import './ui/ui.css';
import type { EngineMoment } from './domain';
import { useSonotoki } from './store/useSonotoki';
import { NoteInput } from './ui/NoteInput';
import { InferenceToast } from './ui/InferenceToast';
import { MomentList } from './ui/MomentList';
import { WorldSim } from './ui/WorldSim';
import { SonotokiMoment } from './ui/SonotokiMoment';
import { Onboarding } from './ui/Onboarding';

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

  const isEmpty = state.moments.length === 0;

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead__top">
          <div className="wordmark">そのとき</div>
          <button
            type="button"
            className="masthead__reset"
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
            {confirmReset ? 'もう一度で消去' : 'リセット'}
          </button>
        </div>
        <p className="thesis">
          覚えておかなくていいメモ。書くのは<b>“何を”</b>だけ。
          <b>“いつ・どこで”</b>は、そのときが決めます。
        </p>
        <p className="hero-demo" aria-hidden="true">
          <span className="hero-demo__in">牛乳なくなりそう</span>
          <span className="hero-demo__arrow">→</span>
          <span className="hero-demo__out">次にスーパーに着いたとき</span>
        </p>
      </header>

      <main className="stage">
        <WorldSim world={state.world} waitingByPlace={waitingByPlace} onEvent={actions.sim} />

        <section className="compose">
          <NoteInput onSubmit={actions.submit} showExamples={!isEmpty} />
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

        {isEmpty && <Onboarding onTry={actions.submit} />}

        {!isEmpty && (
          <MomentList
            moments={state.moments}
            onRepick={actions.repick}
            onRemove={actions.remove}
          />
        )}

        <p className="stage__note">
          Web プロトタイプ。実機ではバックグラウンドの位置通知を OS が担う部分を、
          ここでは「状況シミュレーション」で再現しています。
        </p>
      </main>

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
