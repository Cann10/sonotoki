import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clear } from '../domain';

interface Props {
  children: ReactNode;
}
interface State {
  failed: boolean;
}

/** デモ中に何かが throw しても白画面にしない。1タップで作り直せる。 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[そのとき] 予期しないエラー', error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash">
        <p className="crash__title">うまく表示できませんでした。</p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            clear();
            location.reload();
          }}
        >
          作り直す
        </button>
      </div>
    );
  }
}
