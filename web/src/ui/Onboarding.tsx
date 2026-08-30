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
        「牛乳なくなりそう」で試す
      </button>
      <p className="onboarding__steps">
        <span>書く</span>
        <span className="onboarding__arrow">→</span>
        <span>場所を動かす</span>
        <span className="onboarding__arrow">→</span>
        <span>「そのときです。」</span>
      </p>
    </section>
  );
}
