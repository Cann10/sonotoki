import { useRef, useState } from 'react';

const EXAMPLES = [
  '牛乳なくなりそう',
  '傘、大学に置いてきた',
  '会社で部長に日報の件を伝える',
  '週末出かけたら折り畳み傘を入れる',
];

interface Props {
  onSubmit: (text: string) => void;
  showExamples?: boolean;
}

export function NoteInput({ onSubmit, showExamples = true }: Props) {
  const [text, setText] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
    areaRef.current?.focus();
  }

  return (
    <form
      className="note-input"
      onSubmit={(e) => {
        e.preventDefault();
        submit(text);
      }}
    >
      <label className="note-input__label" htmlFor="note">
        いま頭にあることを、ひとつ。
      </label>
      <div className="note-input__row">
        <textarea
          id="note"
          ref={areaRef}
          className="note-input__field"
          rows={2}
          placeholder="牛乳なくなりそう / 傘、大学に置いてきた …"
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(text);
            }
          }}
        />
        <button className="note-input__submit" type="submit" disabled={!text.trim()}>
          あずける
        </button>
      </div>
      {showExamples && (
        <div className="note-input__examples" role="group" aria-label="例">
          <span className="note-input__examples-label">例）</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => submit(ex)}>
              {ex}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
