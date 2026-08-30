import { useEffect, useMemo, useReducer } from 'react';
import {
  applySituation,
  armMoment,
  buildLearningMoment,
  forgetPlace,
  interpret,
  INITIAL_WORLD,
  learnPlace,
  load,
  markDone,
  markNext,
  resolveLearnedMoment,
  save,
  clear,
  type EngineMoment,
  type MomentInterpretation,
  type PlaceDict,
  type PlaceId,
  type SituationEvent,
  type WorldState,
} from '../domain';

export interface LastInference {
  momentId: string;
  interpretation: MomentInterpretation;
  needsConfirm: boolean;
  /** 独自の場所の呼び方を、一度だけ教えてもらう必要があるとき。 */
  teach?: { phrase: string };
  /** 直前に教えて覚えた対応（「覚えました」表示用）。 */
  learned?: { phrase: string; placeId: PlaceId };
}

interface State {
  moments: EngineMoment[];
  world: WorldState;
  placeDict: PlaceDict;
  fireQueue: string[];
  lastInference: LastInference | null;
}

type Action =
  | { type: 'submit'; text: string }
  | { type: 'repick'; momentId: string; candidateIndex: number }
  | { type: 'teachPlace'; momentId: string; placeId: PlaceId }
  | { type: 'forgetPlace'; phrase: string }
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
    placeDict: persisted?.placeDict ?? {},
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
      const interpretation = interpret(text, state.placeDict);
      const top = interpretation.moments[0];

      // 独自の場所の呼び方で、まだ辞書に無い → 一度だけ「どこ?」と尋ねる
      if (top?.needsPlaceLearning && top.placePhrase) {
        const m = buildLearningMoment(interpretation, top);
        return {
          ...state,
          moments: [m, ...state.moments],
          lastInference: {
            momentId: m.id,
            interpretation,
            needsConfirm: false,
            teach: { phrase: top.placePhrase },
          },
        };
      }

      // 通常: 先頭候補を armed に（確認でブロックしない）
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
      const interpretation = interpret(target.originalText, state.placeDict);
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

    case 'teachPlace': {
      const m = state.moments.find((x) => x.id === action.momentId);
      if (!m || !m.placePhrase) return state;
      const placeDict = learnPlace(state.placeDict, m.placePhrase, action.placeId);
      const armed = resolveLearnedMoment(m, action.placeId);
      return {
        ...state,
        placeDict,
        moments: state.moments.map((x) => (x.id === action.momentId ? armed : x)),
        fireQueue: state.fireQueue.filter((id) => id !== action.momentId),
        lastInference:
          state.lastInference?.momentId === action.momentId
            ? {
                ...state.lastInference,
                teach: undefined,
                learned: { phrase: m.placePhrase, placeId: action.placeId },
              }
            : state.lastInference,
      };
    }

    case 'forgetPlace':
      return { ...state, placeDict: forgetPlace(state.placeDict, action.phrase) };

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
        // 状況を動かし始めたら推論トーストは消す。ただし「場所を教えて」待ちは残す。
        lastInference: state.lastInference?.teach ? state.lastInference : null,
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
      return {
        moments: [],
        world: { ...INITIAL_WORLD },
        placeDict: {},
        fireQueue: [],
        lastInference: null,
      };
  }
}

export function useSonotoki() {
  const [state, dispatch] = useReducer(reducer, undefined, initState);

  useEffect(() => {
    save({ moments: state.moments, world: state.world, placeDict: state.placeDict });
  }, [state.moments, state.world, state.placeDict]);

  const actions = useMemo(
    () => ({
      submit: (text: string) => dispatch({ type: 'submit', text }),
      repick: (momentId: string, candidateIndex: number) =>
        dispatch({ type: 'repick', momentId, candidateIndex }),
      teachPlace: (momentId: string, placeId: PlaceId) =>
        dispatch({ type: 'teachPlace', momentId, placeId }),
      forgetPlace: (phrase: string) => dispatch({ type: 'forgetPlace', phrase }),
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
