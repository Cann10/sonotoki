import { useEffect, useRef } from 'react';
import type { EngineMoment } from '../domain';
import { Icon } from './Icon';

interface Props {
  moment: EngineMoment;
  queueRemaining: number;
  onDone: () => void;
  onNext: () => void;
}

export function SonotokiMoment({ moment, queueRemaining, onDone, onNext }: Props) {
  const doneRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    doneRef.current?.focus();
  }, [moment.id]);

  return (
    <div className="sonotoki" role="alertdialog" aria-label="そのとき" aria-modal="true">
      <div className="sonotoki__card">
        <p className="sonotoki__eyebrow">そのとき</p>
        <p className="sonotoki__headline">そのときです。</p>
        <p className="sonotoki__memo">{moment.originalText}</p>
        <p className="sonotoki__condition">{moment.humanLabel}</p>

        <div className="sonotoki__actions">
          <button ref={doneRef} type="button" className="btn btn--primary" onClick={onDone}>
            <Icon name="check" size={17} className="btn__icon" />
            やった
          </button>
          <button type="button" className="btn btn--ghost" onClick={onNext}>
            <Icon name="loop" size={17} className="btn__icon" />
            次のそのとき
          </button>
        </div>

        <p className="sonotoki__hint">
          「次のそのとき」は時間で鳴らしません。<b>また同じ状況になったとき</b>に戻します。
        </p>

        {moment.firedCount > 1 && (
          <p className="sonotoki__foot">この条件で戻ってくるのは {moment.firedCount} 回目</p>
        )}
        {queueRemaining > 0 && (
          <p className="sonotoki__foot">ほかにも {queueRemaining} 件、そのときが来ています</p>
        )}
      </div>
    </div>
  );
}
