import { useEffect, useRef } from 'react';
import type { Dispatch } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import type { MobilityState } from '../../types/mobility';
import { actionCreators, type MobilityAction } from '../../state/actions';
import { DEMO_TOTAL_STEPS } from '../../state/mobilityReducer';
import { formatCurrency } from '../../utils/formatters';

interface DemoRunnerProps {
  state: MobilityState;
  dispatch: Dispatch<MobilityAction>;
  t: (key: string) => string;
}

interface DemoStep {
  title: string;
  detail: string;
  durationMs: number;
}

export const DEMO_STEPS: DemoStep[] = [
  {
    title: 'A normal seeded morning',
    detail: 'Eight Karnataka-inspired stops, three government routes and five students waiting at Adyar. All demand is simulated.',
    durationMs: 2800,
  },
  {
    title: 'Heavy monsoon disruption',
    detail: 'A seeded rain event floods the Melkar–BC Road link and increases every graph-edge travel time by 40%.',
    durationMs: 3400,
  },
  {
    title: 'Route A bus becomes unavailable',
    detail: 'The Route A bus reports a breakdown. Meena is stranded at Adyar with no government bus to her college.',
    durationMs: 3400,
  },
  {
    title: 'The corridor map highlights the gap',
    detail: 'The closed road turns red on the SVG graph and the affected route is marked. No feasible route uses a closed edge.',
    durationMs: 3000,
  },
  {
    title: 'Meena texts “1”',
    detail: 'From a feature phone, Meena requests a last-mile match. The SMS is simulated and uses the active language.',
    durationMs: 3600,
  },
  {
    title: 'The engine identifies her cluster',
    detail: 'Waiting pings at Adyar for Sahyadri FGC are grouped into one intact cluster of six students — clusters are never split silently.',
    durationMs: 3200,
  },
  {
    title: 'A shared vehicle is recommended',
    detail: 'Capacity-constrained allocation compares Auto-3, Feeder Van-1 and Carpool-2, then ranks by cost, ETA, reliability, detour, seat fit and verification.',
    durationMs: 3600,
  },
  {
    title: 'Fare and reasoning are shown',
    detail: 'The optimizer explains the shared fare per student versus a solo auto, the detour, the ETA and the driver verification tier.',
    durationMs: 3200,
  },
  {
    title: 'Guardian OTP is confirmed',
    detail: 'The simulated guardian OTP is confirmed for the matched dispatch. A dispatch cannot continue to approval without this consent.',
    durationMs: 3400,
  },
  {
    title: 'Coordinator approves the dispatch',
    detail: 'The control-center tab re-validates the latest capacity and version, then authorizes the dispatch. Approval is idempotent.',
    durationMs: 3400,
  },
  {
    title: 'Auto-3 departs; ETA counts down',
    detail: 'The vehicle moves on the SVG corridor and the simulated clock reduces the ETA. Seat capacity was reserved at match time.',
    durationMs: 11000,
  },
  {
    title: 'Trip completes and impact updates',
    detail: 'The trip reaches completion. Impact metrics and the decision log update from the completed dispatch — not from an animation.',
    durationMs: 2400,
  },
];

export function DemoRunner({ state, dispatch, t }: DemoRunnerProps) {
  const appliedRef = useRef(-1);
  const stateRef = useRef(state);
  stateRef.current = state;

  const topPlanForMeena = (): string | undefined => {
    const current = stateRef.current;
    const cluster = current.clusters.find(
      (candidate) =>
        candidate.villageId === current.studentProfile.villageId &&
        candidate.destinationCollegeId === current.studentProfile.collegeId,
    );
    if (!cluster) return undefined;
    return current.plans.find(
      (plan) => plan.clusterId === cluster.id && plan.feasibilityStatus !== 'infeasible',
    )?.id;
  };

  const executeStep = (step: number): void => {
    const current = stateRef.current;
    const dispatchForMeena = [...current.dispatches]
      .filter(
        (trip) =>
          trip.villageId === current.studentProfile.villageId &&
          trip.destinationCollegeId === current.studentProfile.collegeId &&
          trip.status !== 'cancelled',
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    switch (step) {
      case 0:
        dispatch(actionCreators.setClock(true));
        break;
      case 1:
        dispatch(actionCreators.triggerDisruption('heavy-rain'));
        dispatch(actionCreators.setView('coordinator'));
        break;
      case 2:
        dispatch(actionCreators.triggerDisruption('bus-breakdown'));
        break;
      case 3:
        dispatch(actionCreators.setView('coordinator'));
        break;
      case 4:
        dispatch(actionCreators.setView('student'));
        dispatch(
          actionCreators.requestPing(
            current.studentProfile.villageId,
            current.studentProfile.collegeId,
            'sms',
            current.studentProfile.alias,
            'Guided demo: Meena texts 1',
          ),
        );
        break;
      case 5:
        dispatch(actionCreators.setView('student'));
        break;
      case 6: {
        dispatch(actionCreators.setView('student'));
        if (!dispatchForMeena) {
          const planId = topPlanForMeena();
          if (planId) dispatch(actionCreators.matchPlan(planId));
        }
        break;
      }
      case 7:
        dispatch(actionCreators.setView('student'));
        break;
      case 8: {
        dispatch(actionCreators.setView('student'));
        if (dispatchForMeena?.status === 'matched') {
          dispatch(actionCreators.confirmConsent(dispatchForMeena.id, dispatchForMeena.consent.otp));
        }
        break;
      }
      case 9: {
        dispatch(actionCreators.setView('coordinator'));
        if (dispatchForMeena) {
          if (dispatchForMeena.status === 'matched') {
            dispatch(actionCreators.confirmConsent(dispatchForMeena.id, dispatchForMeena.consent.otp));
          }
          if (
            dispatchForMeena.status === 'matched' ||
            dispatchForMeena.status === 'guardian_consented'
          ) {
            dispatch(actionCreators.approveDispatch(dispatchForMeena.id));
          }
        }
        break;
      }
      case 10: {
        dispatch(actionCreators.setView('coordinator'));
        dispatch(actionCreators.setClock(true));
        if (dispatchForMeena) {
          if (dispatchForMeena.status === 'guardian_consented') {
            dispatch(actionCreators.approveDispatch(dispatchForMeena.id));
          }
          if (dispatchForMeena.status === 'approved') {
            dispatch(actionCreators.startTrip(dispatchForMeena.id));
          }
        }
        break;
      }
      case 11:
        dispatch(actionCreators.setView('coordinator'));
        if (dispatchForMeena?.status === 'dispatched') {
          dispatch(actionCreators.completeTrip(dispatchForMeena.id));
        }
        break;
      default:
        break;
    }
  };

  // Apply each step's side effects exactly once.
  useEffect(() => {
    if (!state.demo.active || !state.demo.playing) return;
    if (state.demo.step >= DEMO_STEPS.length) return;
    if (appliedRef.current === state.demo.step) return;
    const step = state.demo.step;
    appliedRef.current = step;
    executeStep(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.demo.active, state.demo.playing, state.demo.step]);

  // Advance the step on a timer. This effect is independent of the once-only
  // execution guard so pause/resume restarts the timer correctly.
  useEffect(() => {
    if (!state.demo.active || !state.demo.playing) return undefined;
    if (state.demo.step >= DEMO_STEPS.length) return undefined;
    const step = state.demo.step;
    const timer = window.setTimeout(() => {
      const next = step + 1;
      dispatch(actionCreators.setDemoStep(next, next < DEMO_STEPS.length));
    }, DEMO_STEPS[step].durationMs);
    return () => window.clearTimeout(timer);
  }, [state.demo.active, state.demo.playing, state.demo.step, dispatch]);

  if (!state.demo.active) return null;

  const step = Math.min(state.demo.step, DEMO_STEPS.length);
  const complete = state.demo.step >= DEMO_STEPS.length;
  const current = DEMO_STEPS[Math.min(step, DEMO_STEPS.length - 1)];
  const progress = Math.round((step / DEMO_STEPS.length) * 100);

  const resetDemo = (): void => {
    appliedRef.current = -1;
    dispatch(actionCreators.reset('normal'));
    dispatch(actionCreators.setClock(true));
    dispatch(actionCreators.setView('student'));
    dispatch(actionCreators.setDemo(true, 0, true));
  };

  const close = (): void => {
    dispatch(actionCreators.setDemo(false, 0, false));
  };

  return (
    <section
      className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-4xl rounded-2xl border-2 border-forest-300 bg-white/98 p-3 shadow-2xl backdrop-blur sm:bottom-4 sm:p-4"
      aria-labelledby="demo-runner-heading"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-clay-700">
            <Sparkles size={13} aria-hidden="true" /> {t('demo.title')}
          </div>
          <h2 id="demo-runner-heading" className="mt-0.5 text-sm font-bold text-forest-950 sm:text-base">
            {complete ? 'Demo complete — six students served safely' : current.title}
          </h2>
          <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-forest-700 sm:text-xs">
            {complete
              ? `Auto-3 completed the trip. ${state.impact.studentsRescued} student(s) rescued, ${formatCurrency(state.impact.rupeesSaved)} estimated saved, ${state.impact.tripsCompleted} completed trip(s).`
              : current.detail}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => dispatch(actionCreators.setDemoStep(state.demo.step, !state.demo.playing))}
            aria-label={state.demo.playing ? t('demo.pause') : t('demo.play')}
          >
            {state.demo.playing ? <Pause size={13} /> : <Play size={13} />}
            {state.demo.playing ? t('demo.pause') : t('demo.play')}
          </button>
          <button type="button" className="btn btn-sm" onClick={resetDemo} aria-label={t('demo.reset')}>
            <RotateCcw size={13} /> {t('demo.reset')}
          </button>
          <button type="button" className="btn btn-sm px-2" onClick={close} aria-label="Close demo">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px] font-semibold text-forest-600">
          <span>
            {t('demo.step')} {Math.min(step, DEMO_STEPS.length)} / {DEMO_TOTAL_STEPS}
          </span>
          <span>{complete ? '100%' : `${progress}%`}</span>
        </div>
        <div
          className="mt-1 h-2 overflow-hidden rounded-full bg-forest-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={complete ? 100 : progress}
          aria-label="Guided demo progress"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-forest-500 to-clay-500 transition-all"
            style={{ width: `${complete ? 100 : progress}%` }}
          />
        </div>
      </div>

      <ol className="scrollbar-thin mt-2 flex gap-1 overflow-x-auto pb-1" aria-label="Demo steps">
        {DEMO_STEPS.map((demoStep, index) => {
          const done = index < state.demo.step;
          const isCurrent = index === state.demo.step;
          return (
            <li
              key={demoStep.title}
              className={`flex min-w-[104px] flex-col gap-0.5 rounded-lg border px-2 py-1 ${
                isCurrent
                  ? 'border-forest-400 bg-forest-50'
                  : done
                    ? 'border-forest-100 bg-white'
                    : 'border-forest-50 bg-forest-50/30'
              }`}
            >
              <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-forest-500">
                {done ? (
                  <CheckCircle2 size={10} className="text-forest-600" aria-hidden="true" />
                ) : (
                  <Circle size={10} className={isCurrent ? 'text-clay-500' : 'text-forest-300'} aria-hidden="true" />
                )}
                {index + 1}
              </span>
              <span className={`text-[10px] leading-tight ${isCurrent ? 'font-bold text-forest-900' : 'text-forest-600'}`}>
                {demoStep.title}
              </span>
            </li>
          );
        })}
      </ol>

      {complete ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-[11px] text-emerald-900">
          <ChevronRight size={14} aria-hidden="true" />
          The demo is reproducible for seed {state.seed}. Reset restores the exact seeded scenario.
          <button type="button" className="btn btn-sm ml-auto" onClick={resetDemo}>
            <RotateCcw size={12} aria-hidden="true" /> Run again
          </button>
        </div>
      ) : null}
    </section>
  );
}
