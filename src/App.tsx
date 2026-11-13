import { useEffect, useReducer } from 'react';
import type { MobilityState } from './types/mobility';
import { DEFAULT_SCENARIO_ID } from './data/seedData';
import { translate } from './data/translations';
import { actionCreators, type DisruptionKind } from './state/actions';
import { createRuntimeState, hydrateState, mobilityReducer } from './state/mobilityReducer';
import { loadState } from './state/persistence';
import { browserStorage, useCrossTabSync } from './hooks/useCrossTabSync';
import { useSimulationClock } from './hooks/useSimulationClock';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { StudentView } from './components/student/StudentView';
import { CoordinatorView } from './components/coordinator/CoordinatorView';
import { DemoRunner } from './components/demo/DemoRunner';

function initState(_: null): MobilityState {
  const storage = browserStorage();
  if (!storage) return createRuntimeState(DEFAULT_SCENARIO_ID);
  const loaded = loadState(storage, DEFAULT_SCENARIO_ID);
  return hydrateState(loaded.state ?? createRuntimeState(DEFAULT_SCENARIO_ID));
}

export default function App() {
  const [state, dispatch] = useReducer(mobilityReducer, null, initState);
  const t = (key: string): string => translate(state.language, key);

  useSimulationClock(state.clockRunning, dispatch);
  useCrossTabSync(state, dispatch);

  useEffect(() => {
    document.documentElement.lang = state.language === 'kn' ? 'kn' : state.language === 'hi' ? 'hi' : 'en';
  }, [state.language]);

  const runDemo = (): void => {
    dispatch(actionCreators.reset('normal'));
    dispatch(actionCreators.setClock(true));
    dispatch(actionCreators.setView('student'));
    dispatch(actionCreators.setDemo(true, 0, true));
  };

  const trigger = (kind: DisruptionKind): void => {
    dispatch(actionCreators.triggerDisruption(kind));
  };

  return (
    <div className="flex min-h-screen flex-col bg-parchment">
      <Header state={state} dispatch={dispatch} t={t} onRunDemo={runDemo} onTrigger={trigger} />
      <main className="flex-1 pb-10">
        {state.view === 'student' ? (
          <StudentView state={state} dispatch={dispatch} t={t} />
        ) : (
          <CoordinatorView state={state} dispatch={dispatch} t={t} />
        )}
      </main>
      <Footer state={state} dispatch={dispatch} t={t} />
      <DemoRunner state={state} dispatch={dispatch} t={t} />
    </div>
  );
}
