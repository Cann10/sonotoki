import { placeLabel, stripPlaces, TIME_BUCKET_LABEL } from '../domain';
import type { PlaceId, SituationEvent, TimeBucket, WorldState } from '../domain';

interface Props {
  world: WorldState;
  waitingByPlace: Record<string, number>;
  onEvent: (event: SituationEvent) => void;
}

const TIME_BUCKETS: TimeBucket[] = ['this_evening', 'tomorrow_morning'];

export function WorldSim({ world, waitingByPlace, onEvent }: Props) {
  const places = stripPlaces();
  const here = world.location;
  const anyWaiting = Object.values(waitingByPlace).some((n) => n > 0);

  function tapPlace(id: PlaceId) {
    if (here === id) {
      onEvent({ type: 'exit', placeId: id });
    } else if (here === 'outside') {
      onEvent({ type: 'enter', placeId: id });
    } else {
      onEvent({ type: 'exit', placeId: here });
      onEvent({ type: 'enter', placeId: id });
    }
  }

  return (
    <div className="world">
      <div className="world__inner">
        <div className="world__head">
          <h2 className="world__title">いま、どこにいる?</h2>
          <p className="world__hint">
            {anyWaiting
              ? 'タップして移動。あずけたメモは、その場所で待っています。'
              : 'メモをあずけると、その場所で「そのとき」を待ちます。'}
          </p>
        </div>

        <div className="world__strip" role="group" aria-label="場所">
          <button
            type="button"
            className={`place place--outside${here === 'outside' ? ' is-here' : ''}`}
            onClick={() => here !== 'outside' && onEvent({ type: 'exit', placeId: here })}
            disabled={here === 'outside'}
          >
            <span className="place__label">外</span>
          </button>

          <span className="world__rail" aria-hidden="true" />

          {places.map((p) => {
            const count = waitingByPlace[p.id] ?? 0;
            return (
              <button
                key={p.id}
                type="button"
                className={`place${here === p.id ? ' is-here' : ''}`}
                onClick={() => tapPlace(p.id)}
                aria-pressed={here === p.id}
              >
                <span className="place__label">{p.label}</span>
                {count > 0 && (
                  <span className="place__waiting" title={`${count}件のそのとき`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="world__now">
          <span className="world__now-label">現在地</span>
          <span className="world__now-value">
            {here === 'outside' ? '外' : placeLabel(here)}
          </span>
          <span className="world__time">
            {TIME_BUCKETS.map((b) => (
              <button
                key={b}
                type="button"
                className={`timebtn${world.lastTimeBucket === b ? ' is-now' : ''}`}
                onClick={() => onEvent({ type: 'time', timeBucket: b })}
              >
                {TIME_BUCKET_LABEL[b]}にする
              </button>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
