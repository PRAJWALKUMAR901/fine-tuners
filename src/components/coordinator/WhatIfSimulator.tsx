import { useMemo, useState } from 'react';
import { FlaskConical, Plus, Route, TimerReset } from 'lucide-react';
import type { BusRoute, MobilityState, ReallocationKind } from '../../types/mobility';
import { simulateWhatIf } from '../../services/routeOptimizer';
import { formatPercent, riskTone } from '../../utils/formatters';

interface WhatIfSimulatorProps {
  state: MobilityState;
  t: (key: string) => string;
}

const OPTIONS: { kind: ReallocationKind; label: string }[] = [
  { kind: 'add-relief-bus', label: 'Add relief bus' },
  { kind: 'increase-frequency', label: 'Increase frequency' },
  { kind: 'emergency-stop', label: 'Emergency feeder stop' },
  { kind: 'reorder-stops', label: 'Reorder stops' },
];

export function WhatIfSimulator({ state, t }: WhatIfSimulatorProps) {
  const [routeId, setRouteId] = useState(
    state.busRoutes.find((route) => route.id === 'route-a')?.id ?? state.busRoutes[0]?.id ?? '',
  );
  const [kind, setKind] = useState<ReallocationKind>('add-relief-bus');

  const result = useMemo(
    () =>
      simulateWhatIf(state, {
        kind,
        routeId,
        label: OPTIONS.find((option) => option.kind === kind)?.label ?? kind,
      }),
    [state, kind, routeId],
  );
  const route = state.busRoutes.find((candidate) => candidate.id === routeId);
  const beforeTone = riskTone(result.riskBefore);
  const afterTone = riskTone(result.riskAfter);

  const routeLabel = (candidate: BusRoute): string => `Route ${candidate.code} · ${candidate.name}`;

  return (
    <section className="card p-4" aria-labelledby="whatif-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="whatif-heading" className="panel-title flex items-center gap-2">
            <FlaskConical size={16} className="text-forest-600" aria-hidden="true" />
            {t('coordinator.whatif')}
          </h2>
          <p className="text-xs text-forest-600">
            Read-only simulation. No fleet state is changed.
          </p>
        </div>
        <span className="chip bg-forest-100 text-forest-800">Simulated</span>
      </div>

      {state.reallocations.length > 0 ? (
        <div className="mt-3 rounded-xl border border-forest-100 bg-forest-50/60 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-forest-700">
            Generated network recommendations
          </div>
          <ul className="mt-1.5 space-y-1.5">
            {state.reallocations.slice(0, 3).map((reallocation) => (
              <li key={reallocation.id} className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                <div>
                  <span className="font-semibold text-forest-900">{reallocation.title}</span>{' '}
                  <span className="text-forest-600">
                    risk {formatPercent(reallocation.riskBefore)} → {formatPercent(reallocation.riskAfter)},{' '}
                    capacity {reallocation.capacityBefore} → {reallocation.capacityAfter}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setRouteId(reallocation.routeId);
                    setKind(reallocation.kind);
                  }}
                >
                  Simulate
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label>
          <span className="label">Government route</span>
          <select className="field" value={routeId} onChange={(event) => setRouteId(event.target.value)}>
            {state.busRoutes.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {routeLabel(candidate)}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="label">Proposed intervention</span>
          <div className="flex flex-wrap gap-1.5">
            {OPTIONS.map((option) => (
              <button
                key={option.kind}
                type="button"
                className={`btn btn-sm ${kind === option.kind ? 'btn-primary' : ''}`}
                aria-pressed={kind === option.kind}
                onClick={() => setKind(option.kind)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-forest-100 p-3">
          <div className="stat-label flex items-center gap-1">
            <Route size={12} aria-hidden="true" /> Existing capacity
          </div>
          <div className="stat-value">{result.capacityBefore}</div>
          <div className="text-[11px] text-forest-600">seats · demand {result.demand}</div>
        </div>
        <div className={`rounded-xl border p-3 ${afterTone.bg} ${afterTone.ring} ring-1`}>
          <div className="stat-label flex items-center gap-1">
            <Plus size={12} aria-hidden="true" /> Projected capacity
          </div>
          <div className="stat-value">{result.capacityAfter}</div>
          <div className="text-[11px] text-forest-700">+{result.seatsAdded} seats modeled</div>
        </div>
        <div className={`rounded-xl border p-3 ${afterTone.bg} ${afterTone.ring} ring-1`}>
          <div className="stat-label flex items-center gap-1">
            <TimerReset size={12} aria-hidden="true" /> Risk before → after
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-lg font-black tabular-nums">
            <span className={beforeTone.text}>{formatPercent(result.riskBefore)}</span>
            <span aria-hidden="true" className="text-forest-400">→</span>
            <span className={afterTone.text}>{formatPercent(result.riskAfter)}</span>
          </div>
          <div className="text-[11px] text-forest-600">
            {beforeTone.label} → {afterTone.label}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-forest-600">
          <span>Overcrowding risk</span>
          <span>{route ? `Route ${route.code}` : ''}</span>
        </div>
        <div className="mt-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-12 text-[10px] font-semibold text-forest-600">Before</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-forest-100">
              <div
                className="h-full rounded-full bg-forest-400"
                style={{ width: `${Math.round(result.riskBefore * 100)}%` }}
              />
            </div>
            <span className="w-10 text-right text-[10px] font-bold tabular-nums">
              {formatPercent(result.riskBefore)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-12 text-[10px] font-semibold text-forest-600">After</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-forest-100">
              <div
                className="h-full rounded-full bg-clay-500"
                style={{ width: `${Math.round(result.riskAfter * 100)}%` }}
              />
            </div>
            <span className="w-10 text-right text-[10px] font-bold tabular-nums">
              {formatPercent(result.riskAfter)}
            </span>
          </div>
        </div>
      </div>

      <ul className="mt-3 space-y-1 rounded-xl bg-forest-50/70 p-3 text-[11px] leading-relaxed text-forest-700">
        {result.reasoning.map((reason, index) => (
          <li key={`whatif-${index}`}>• {reason}</li>
        ))}
      </ul>
    </section>
  );
}
