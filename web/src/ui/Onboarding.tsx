interface Props {
  onTry: (text: string) => void;
}

/** 初見の人向け。1タップで最初の1件を試せる。moments が空のときだけ出す。 */
export function Onboarding({ onTry }: Props) {
  return (
    <section className="onboarding">
      <button
        type="button"
        className="onboarding__try"
        onClick={() => onTry('牛乳なくなりそう')}
      >
        <span className="onboarding__try-phrase">牛乳なくなりそう</span>
        <span className="onboarding__try-hint">と書いて、置いてみる</span>
      </button>
      <p className="onboarding__steps">
        <span>書く</span>
        <span className="onboarding__arrow">—</span>
        <span>場所を動かす</span>
        <span className="onboarding__arrow">—</span>
        <span>そのとき、戻ってくる</span>
      </p>
    </section>
  );
}
