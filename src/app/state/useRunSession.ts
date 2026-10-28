import { useCallback, useReducer } from 'react';
import { Run } from '../../orchestration/types';
import { loadRunHistoryResult } from '../../persistence/runStore';
import type { StorageRead } from '../../persistence/storageSafety';

export type RunSessionState = {
  /** The run on screen. */
  current: Run | null;
  /** The saved runs, newest first, capped. */
  history: Run[];
  /** The selected run. Always the current one, so the two panes cannot disagree. */
  selectedId: string;
};

/** The session as the rest of the app sees it. */
export type RunSession = {
  current: Run | null;
  history: Run[];
  selectedId: string;
  upsertRun: (run: Run) => void;
  selectRun: (id: string) => void;
  clearCurrent: () => void;
  /** Empties the history on screen, after the saved runs were moved aside or discarded. */
  clearHistory: () => void;
  loadRuns: (runs: Run[]) => void;
  /**
   * Reads the saved runs from the device.
   *
   * The result is returned rather than swallowed, so the screen can tell a first run from a
   * history that could not be read and name the copy that was kept aside.
   */
  loadHistory: () => Promise<StorageRead<Run[]>>;
};

type Action =
  | { type: 'loaded'; runs: Run[] }
  | { type: 'upsert'; run: Run }
  | { type: 'select'; id: string }
  | { type: 'clear' }
  | { type: 'clearHistory' };

const HISTORY_LIMIT = 30;

const initialState: RunSessionState = { current: null, history: [], selectedId: '' };

function reducer(state: RunSessionState, action: Action): RunSessionState {
  switch (action.type) {
    case 'loaded': {
      if (!action.runs.length) return state;
      const first = action.runs[0];
      return { current: first, history: action.runs, selectedId: first.id };
    }
    case 'upsert': {
      const history = [action.run, ...state.history.filter(item => item.id !== action.run.id)].slice(0, HISTORY_LIMIT);
      return { current: action.run, history, selectedId: action.run.id };
    }
    case 'select': {
      const found = state.history.find(item => item.id === action.id);
      return { current: found ?? state.current, history: state.history, selectedId: action.id };
    }
    case 'clear':
      return { current: null, history: state.history, selectedId: '' };
    case 'clearHistory':
      return { current: null, history: [], selectedId: '' };
  }
}

/**
 * The one place that knows which run is open.
 *
 * `run`, `runHistory` and `selectedRunId` used to be three separate pieces of state that could
 * disagree: the approve path updated the run and the history but not the selected id, so the
 * runs inbox and the results screen could show different runs. Here the selected id follows the
 * current run, so the two panes always agree.
 */
export function useRunSession(): RunSession {
  const [state, dispatch] = useReducer(reducer, initialState);

  const upsertRun = useCallback((run: Run) => dispatch({ type: 'upsert', run }), []);
  const selectRun = useCallback((id: string) => dispatch({ type: 'select', id }), []);
  const clearCurrent = useCallback(() => dispatch({ type: 'clear' }), []);
  const clearHistory = useCallback(() => dispatch({ type: 'clearHistory' }), []);
  const loadRuns = useCallback((runs: Run[]) => dispatch({ type: 'loaded', runs }), []);
  const loadHistory = useCallback(async () => {
    const result = await loadRunHistoryResult();
    if (result.value.length) loadRuns(result.value);
    return result;
  }, [loadRuns]);

  return {
    current: state.current,
    history: state.history,
    selectedId: state.selectedId,
    upsertRun,
    selectRun,
    clearCurrent,
    clearHistory,
    loadRuns,
    loadHistory,
  };
}
