import type { Dispatch } from 'react';
import {
  AlertTriangle,
  BusFront,
  CloudRain,
  GraduationCap,
  Languages,
  LayoutDashboard,
  Pause,
  Play,
  Route as RouteIcon,
  RotateCcw,
  Smartphone,
  Siren,
  Sparkles,
} from 'lucide-react';
import type { Language, MobilityState } from '../../types/mobility';
import type { DisruptionKind, MobilityAction } from '../../state/actions';
import { actionCreators } from '../../state/actions';
import { scenarios } from '../../data/scenarios';
import { languageLabels } from '../../data/translations';
import { formatClock } from '../../utils/formatters';

interface HeaderProps {
  state: MobilityState;
  dispatch: Dispatch<MobilityAction>;
  t: (key: string) => string;
  onRunDemo: () => void;
  onTrigger: (kind: DisruptionKind) => void;
}

const languages: Language[] = ['en', 'kn', 'hi'];

export function Header({ state, dispatch, t, onRunDemo, onTrigger }: HeaderProps) {
  const toggleClock = (): void => {
    dispatch(actionCreators.setClock(!state.clockRunning));
  };

  return (
    <header className="sticky top-0 z-30 border-b border-forest-200 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-[1440px] px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-forest-800 text-white shadow-sm">
              <RouteIcon size={24} aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <h1 className="font-display text-xl font-black tracking-tight text-forest-950">
                  GramRoute <span className="text-clay-600">AI</span>
                </h1>
                <span className="hidden text-[10px] font-bold uppercase tracking-widest text-forest-500 sm:inline">
                  {t('common.simulated')}
                </span>
              </div>
              <p className="text-xs font-medium text-forest-600">{t('brand.tagline')}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-forest-200 bg-forest-50 px-3 py-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  state.clockRunning ? 'animate-pulseSoft bg-emerald-500' : 'bg-amber-500'
                }`}
                aria-hidden="true"
              />
              <span className="text-xs font-semibold text-forest-800">
                {state.clockRunning ? t('status.live') : t('status.paused')}
              </span>
              <span className="font-mono text-xs tabular-nums text-forest-700">
                {formatClock(state.simMinutes)}
              </span>
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-forest-200 bg-white p-1" role="group" aria-label="Language">
              <Languages size={15} className="ml-1 text-forest-500" aria-hidden="true" />
              {languages.map((language) => (
                <button
                  key={language}
                  type="button"
                  className={`min-h-[32px] rounded-lg px-2 text-xs font-bold ${
                    state.language === language
                      ? 'bg-forest-700 text-white'
                      : 'text-forest-700 hover:bg-forest-50'
                  }`}
                  aria-pressed={state.language === language}
                  onClick={() => dispatch(actionCreators.setLanguage(language))}
                >
                  {languageLabels[language]}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={onRunDemo}
              aria-label="Run the guided Meena demo"
            >
              <Sparkles size={16} aria-hidden="true" />
              {t('demo.run')}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-forest-200 bg-forest-50 p-1" role="tablist" aria-label="Application view">
              <button
                type="button"
                role="tab"
                aria-selected={state.view === 'student'}
                className={`flex min-h-[38px] items-center gap-2 rounded-lg px-3 text-sm font-semibold ${
                  state.view === 'student' ? 'bg-white text-forest-900 shadow-sm' : 'text-forest-700'
                }`}
                onClick={() => dispatch(actionCreators.setView('student'))}
              >
                <Smartphone size={15} aria-hidden="true" />
                {t('view.student')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={state.view === 'coordinator'}
                className={`flex min-h-[38px] items-center gap-2 rounded-lg px-3 text-sm font-semibold ${
                  state.view === 'coordinator' ? 'bg-white text-forest-900 shadow-sm' : 'text-forest-700'
                }`}
                onClick={() => dispatch(actionCreators.setView('coordinator'))}
              >
                <LayoutDashboard size={15} aria-hidden="true" />
                {t('view.coordinator')}
              </button>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-forest-700">
              <span className="sr-only sm:not-sr-only">{t('scenario.label')}</span>
              <select
                className="field min-h-[38px] w-auto max-w-[210px] py-1"
                value={state.scenarioId}
                onChange={(event) => dispatch(actionCreators.setScenario(event.target.value))}
              >
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-1" role="group" aria-label="Simulation clock">
              <button
                type="button"
                className="btn btn-sm"
                onClick={toggleClock}
                aria-label={state.clockRunning ? 'Pause simulation' : 'Start simulation'}
              >
                {state.clockRunning ? <Pause size={14} /> : <Play size={14} />}
                {state.clockRunning ? t('sim.pause') : t('sim.resume')}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => dispatch(actionCreators.tick())}
                aria-label="Advance one simulated minute"
              >
                +1 min
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => dispatch(actionCreators.reset(state.scenarioId))}
                aria-label="Reset the simulation to the seeded state"
              >
                <RotateCcw size={14} />
                {t('sim.reset')}
              </button>
            </div>
          </div>

          <div className="scrollbar-thin flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              className="btn btn-sm whitespace-nowrap"
              onClick={() => onTrigger('bus-breakdown')}
            >
              <BusFront size={14} className="text-red-600" aria-hidden="true" /> {t('trigger.breakdown')}
            </button>
            <button
              type="button"
              className="btn btn-sm whitespace-nowrap"
              onClick={() => onTrigger('exam-surge')}
            >
              <AlertTriangle size={14} className="text-amber-600" aria-hidden="true" /> {t('trigger.exam')}
            </button>
            <button
              type="button"
              className="btn btn-sm whitespace-nowrap border-red-300 bg-red-50 text-red-900 hover:bg-red-100"
              onClick={() => onTrigger('exam-crisis')}
              title="Load the seeded exam-day crisis: two buses down, 40% demand increase, flooded village"
            >
              <GraduationCap size={14} className="text-red-700" aria-hidden="true" />{' '}
              {t('trigger.examCrisis')}
            </button>
            <button
              type="button"
              className="btn btn-sm whitespace-nowrap"
              onClick={() => onTrigger('heavy-rain')}
            >
              <CloudRain size={14} className="text-sky-700" aria-hidden="true" /> {t('trigger.rain')}
            </button>
            <button
              type="button"
              className="btn btn-sm whitespace-nowrap"
              onClick={() => onTrigger('route-cancellation')}
            >
              <Siren size={14} className="text-orange-700" aria-hidden="true" /> {t('trigger.cancellation')}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
