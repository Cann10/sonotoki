import { useEffect, useMemo, useReducer } from 'react';
import {
  applySituation,
  armMoment,
  interpret,
  INITIAL_WORLD,
  load,
  markDone,
  markNext,
  save,
  clear,
  type EngineMoment,
  type MomentInterpretation,
  type SituationEvent,
  type WorldState,
} from '../domain';

export interface LastInference {
  momentId: string;
  interpretation: MomentInterpretation;
  needsConfirm: boolean;
}

interface State {
  moments: EngineMoment[];
  world: WorldState;
  fireQueue: string[];
  lastInference: LastInference | null;
}

type Action =
  | { type: 'submit'; text: string }
  | { type: 'repick'; momentId: string; candidateIndex: number }
  | { type: 'remove'; id: string }
  | { type: 'undoLast' }
  | { type: 'dismissToast' }
  | { type: 'sim'; event: SituationEvent }
  | { type: 'done'; id: string }
  | { type: 'next'; id: string }
  | { type: 'reset' };

function initState(): State {
  const persisted = load();
  return {
    moments: persisted?.moments ?? [],
    world: persisted?.world ?? { ...INITIAL_WORLD },
    fireQueue: [],
    lastInference: null,
  };
}

function armFromInterpretation(
  interpretation: MomentInterpretation,
  index: number,
  id?: string,
): EngineMoment | null {
  const candidate = interpretation.moments[index];
  if (!candidate) return null;
  return armMoment(interpretation, candidate, id ? { id } : undefined);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'submit': {
      const text = action.text.trim();
      if (!text) return state;
      const interpretation = interpret(text);
      // まず先頭候補を必ず armed にする（確認でブロックしない — plan §UX）
      let index = 0;
      let moment = armFromInterpretation(interpretation, index);
      while (!moment && index < interpretation.moments.length - 1) {
        index += 1;
        moment = armFromInterpretation(interpretation, index);
      }
      if (!moment) return state;
      return {
        ...state,
        moments: [moment, ...state.moments],
        lastInference: {
          momentId: moment.id,
          interpretation,
          needsConfirm: interpretation.needsUserConfirmation || moment.lowConfidence,
        },
      };
    }

    case 'repick': {
      const target = state.moments.find((m) => m.id === action.momentId);
      if (!target) return state;
      // 元の文をもう一度解釈して、選ばれた候補で armed し直す（トーストが消えていても直せる）
      const interpretation = interpret(target.originalText);
      const replacement = armFromInterpretation(
        interpretation,
        action.candidateIndex,
        action.momentId,
      );
      if (!replacement) return state;
      return {
        ...state,
        moments: state.moments.map((m) => (m.id === action.momentId ? replacement : m)),
        fireQueue: state.fireQueue.filter((id) => id !== action.momentId),
        lastInference:
          state.lastInference && state.lastInference.momentId === action.momentId
            ? { ...state.lastInference, needsConfirm: false }
            : state.lastInference,
      };
    }

    case 'remove':
      return {
        ...state,
        moments: state.moments.filter((m) => m.id !== action.id),
        fireQueue: state.fireQueue.filter((id) => id !== action.id),
        lastInference:
          state.lastInference?.momentId === action.id ? null : state.lastInference,
      };

    case 'undoLast': {
      const inf = state.lastInference;
      if (!inf) return state;
      return {
        ...state,
        moments: state.moments.filter((m) => m.id !== inf.momentId),
        fireQueue: state.fireQueue.filter((id) => id !== inf.momentId),
        lastInference: null,
      };
    }

    case 'dismissToast':
      return { ...state, lastInference: null };

    case 'sim': {
      const now = Date.now();
      const result = applySituation(state.moments, state.world, action.event, now);
      const newlyFired = result.firedIds.filter((id) => !state.fireQueue.includes(id));
      return {
        ...state,
        moments: result.moments,
        world: result.world,
        fireQueue: [...state.fireQueue, ...newlyFired],
        // 状況を動かし始めたら、直前の推論トーストは役目を終える（レイアウトのちらつき防止）
        lastInference: null,
      };
    }

    case 'done':
      return {
        ...state,
        moments: markDone(state.moments, action.id),
        fireQueue: state.fireQueue.filter((id) => id !== action.id),
      };

    case 'next':
      return {
        ...state,
        moments: markNext(state.moments, state.world, action.id),
        fireQueue: state.fireQueue.filter((id) => id !== action.id),
      };

    case 'reset':
      clear();
      return { moments: [], world: { ...INITIAL_WORLD }, fireQueue: [], lastInference: null };
  }
}

export function useSonotoki() {
  const [state, dispatch] = useReducer(reducer, undefined, initState);

  useEffect(() => {
    save({ moments: state.moments, world: state.world });
  }, [state.moments, state.world]);

  const actions = useMemo(
    () => ({
      submit: (text: string) => dispatch({ type: 'submit', text }),
      repick: (momentId: string, candidateIndex: number) =>
        dispatch({ type: 'repick', momentId, candidateIndex }),
      remove: (id: string) => dispatch({ type: 'remove', id }),
      undoLast: () => dispatch({ type: 'undoLast' }),
      dismissToast: () => dispatch({ type: 'dismissToast' }),
      sim: (event: SituationEvent) => dispatch({ type: 'sim', event }),
      done: (id: string) => dispatch({ type: 'done', id }),
      next: (id: string) => dispatch({ type: 'next', id }),
      reset: () => dispatch({ type: 'reset' }),
    }),
    [],
  );

  return { state, actions };
}
