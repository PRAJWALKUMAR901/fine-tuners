import { useMemo, useState } from 'react';
import type { Dispatch } from 'react';
import {
  AlertTriangle,
  BusFront,
  Clock,
  RadioTower,
  ShieldAlert,
  Users,
  UsersRound,
} from 'lucide-react';
import type { MobilityState } from '../../types/mobility';
import { actionCreators, type MobilityAction } from '../../state/actions';
import { runBacktest } from '../../services/backtest';
import { routeRisk } from '../../services/routeOptimizer';
import { formatClock } from '../../utils/formatters';
import { CorridorMap } from '../map/CorridorMap';
import { RecommendationPanel } from './RecommendationPanel';
import { DecisionLog } from './DecisionLog';
import { WhatIfSimulator } from './WhatIfSimulator';
import { ForecastPanel } from './ForecastPanel';
import { BacktestPanel } from './BacktestPanel';
import { ImpactPanel } from './ImpactPanel';
import { CrisisPanel } from './CrisisPanel';

interface CoordinatorViewProps {
  state: MobilityState;
  dispatch: Dispatch<MobilityAction>;
  t: (key: string) => string;
}

export function CoordinatorView({ state, dispatch, t }: CoordinatorViewProps) {
  const [runId, setRunId] = useState(0);

  const backtest = useMemo(
    () =>
      runBacktest({
        seed: state.seed,
        days: 30,
        baselineDemand: 64,
        governmentSeats: 48,
        communitySeats: 25,
        staticHeadwayMinutes: 30,
      }),
    [state.seed, runId],
  );

  const waitingPings = state.pings.filter(
    (ping) => ping.status === 'waiting' || ping.status === 'clustered',
  );
  const riskAlerts = state.busRoutes.filter(
    (route) => routeRisk(route, state.pings, state.simMinutes) >= 0.6,
  );
  const availableSeats = state.vehicles.reduce(
    (total, vehicle) => total + (vehicle.available ? vehicle.availableSeats : 0),
    0,
  );
  const activeTrips = state.dispatches.filter((trip) =>
    ['matched', 'guardian_consented', 'approved', 'dispatched'].includes(trip.status),
  );
  const closedRoads = state.edges.filter((edge) => edge.status !== 'open');
  const alerts: string[] = [];
  if (state.monsoon) alerts.push('Monsoon travel-time multiplier active (×1.4).');
  if (state.examDay) alerts.push('Examination-day demand surge active.');
  if (state.santheDay) alerts.push('Santhe/market-day demand modifier active.');
  state.busRoutes
    .filter((route) => route.status !== 'running')
    .forEach((route) => alerts.push(`Route ${route.code} is ${route.status}.`));
  closedRoads.forEach((edge) =>
    alerts.push(`${edge.from}–${edge.to} is ${edge.status} and removed from routing.`),
  );

  const stats = [
    {
      label: 'Students waiting',
      value: waitingPings.length,
      icon: Users,
      hint: `${state.clusters.length} active cluster(s)`,
    },
    {
      label: 'Community seats',
      value: availableSeats,
      icon: BusFront,
      hint: `${state.vehicles.filter((vehicle) => vehicle.available).length} vehicles available`,
    },
    {
      label: 'Route risk alerts',
      value: riskAlerts.length,
      icon: ShieldAlert,
      hint: `${state.busRoutes.length} government routes monitored`,
    },
    {
      label: 'Active trips',
      value: activeTrips.length,
      icon: RadioTower,
      hint: `${state.dispatches.filter((trip) => trip.status === 'completed').length} completed`,
    },
    {
      label: 'Simulated clock',
      value: formatClock(state.simMinutes),
      icon: Clock,
      hint: state.clockRunning ? 'clock running' : 'clock paused',
    },
  ];

  return (
    <div className="mx-auto max-w-[1440px] space-y-4 px-4 py-4 lg:px-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-3">
            <div className="flex items-center justify-between">
              <span className="stat-label">{stat.label}</span>
              <stat.icon size={15} className="text-forest-500" aria-hidden="true" />
            </div>
            <div className="stat-value">{stat.value}</div>
            <div className="text-[10px] text-forest-500">{stat.hint}</div>
          </div>
        ))}
      </div>

      <CrisisPanel state={state} />

      {alerts.length > 0 ? (
        <div
          className="flex flex-wrap items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
          role="status"
          aria-live="polite"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {alerts.map((alert) => (
              <span key={alert} className="font-medium">
                {alert}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-900">
          <UsersRound size={16} aria-hidden="true" /> Network nominal. All seeded buses running, no
          road closures, no capacity alerts above threshold.
        </div>
      )}

      {state.clusters.length > 0 ? (
        <div className="card flex flex-wrap items-center justify-between gap-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-forest-700">
              <Users size={14} aria-hidden="true" /> Cluster queue
            </span>
            {state.clusters.map((cluster) => {
              const village = state.stops.find((stop) => stop.id === cluster.villageId);
              return (
                <span key={cluster.id} className="chip bg-clay-100 text-clay-900">
                  {village?.name} · {cluster.studentCount}
                </span>
              );
            })}
          </div>
          <p className="text-[10px] text-forest-500">
            Intact clusters only · stale pings expire after 20 simulated minutes · each ping belongs
            to at most one cluster
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <CorridorMap
            state={state}
            focusVillageId={state.studentProfile.villageId}
            focusCollegeId={state.studentProfile.collegeId}
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <DecisionLog state={state} t={t} />
            <WhatIfSimulator state={state} t={t} />
          </div>
        </div>
        <div className="space-y-4">
          <RecommendationPanel state={state} dispatch={dispatch} t={t} />
          <section className="card p-4">
            <h2 className="panel-title">Control-center authority</h2>
            <p className="mt-1 text-xs leading-relaxed text-forest-600">
              This tab is the authoritative writer for dispatch approvals. Approvals include the
              current state version; stale cross-tab actions are rejected. Browser-only sync is a
              demo mechanism and does not provide server-side transaction guarantees.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="chip bg-forest-100 text-forest-700">Version {state.version}</span>
              <span className="chip bg-forest-100 text-forest-700">
                {state.appliedActionIds.length} deduped actions
              </span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => dispatch(actionCreators.setView('student'))}
              >
                Open Student App
              </button>
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ForecastPanel state={state} t={t} />
        <BacktestPanel
          state={state}
          backtest={backtest}
          onRun={() => setRunId((previous) => previous + 1)}
          t={t}
        />
      </div>

      <ImpactPanel state={state} backtest={backtest} t={t} />
    </div>
  );
}
