import { useState } from 'react';
import { BarChart3, RefreshCcw } from 'lucide-react';
import type { BacktestResult, MobilityState } from '../../types/mobility';
import { BacktestChart } from '../charts/BacktestChart';
import { formatCurrency, formatPercent } from '../../utils/formatters';

interface BacktestPanelProps {
  state: MobilityState;
  backtest: BacktestResult;
  onRun: () => void;
  t: (key: string) => string;
}

export function BacktestPanel({ state, backtest, onRun, t }: BacktestPanelProps) {
  const [showDays, setShowDays] = useState(false);
  return (
    <section className="card p-4" aria-labelledby="backtest-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="backtest-heading" className="panel-title flex items-center gap-2">
            <BarChart3 size={16} className="text-forest-600" aria-hidden="true" />
            {t('coordinator.backtest')}
          </h2>
          <p className="text-xs text-forest-600">
            Identical seeded demand and disruptions for both strategies. Simulated results only.
          </p>
        </div>
        <button type="button" className="btn btn-sm" onClick={onRun}>
          <RefreshCcw size={13} aria-hidden="true" /> Re-run 30-day backtest
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-forest-100 bg-forest-50/60 p-2.5">
          <div className="stat-label">Stranded trips prevented</div>
          <div className="stat-value text-forest-900">{backtest.strandedTripsPrevented}</div>
        </div>
        <div className="rounded-xl border border-forest-100 bg-forest-50/60 p-2.5">
          <div className="stat-label">Wait saved</div>
          <div className="stat-value text-forest-900">{backtest.waitMinutesSaved} min</div>
        </div>
        <div className="rounded-xl border border-forest-100 bg-forest-50/60 p-2.5">
          <div className="stat-label">Estimated cost savings</div>
          <div className="stat-value text-forest-900">{formatCurrency(backtest.estimatedCostSavings)}</div>
        </div>
        <div className="rounded-xl border border-forest-100 bg-forest-50/60 p-2.5">
          <div className="stat-label">Utilization (GramRoute)</div>
          <div className="stat-value text-forest-900">{formatPercent(backtest.gramRoute.vehicleUtilization)}</div>
        </div>
      </div>

      <div className="mt-3">
        <BacktestChart result={backtest} />
      </div>

      <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-2">
        <div className="rounded-xl bg-forest-50 p-2.5">
          <div className="font-bold uppercase tracking-wide text-forest-700">Static schedule</div>
          <div className="mt-1 flex justify-between gap-2">
            <span>Stranded</span>
            <span className="font-bold tabular-nums">{backtest.staticSchedule.strandedTrips}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span>Average wait</span>
            <span className="font-bold tabular-nums">{backtest.staticSchedule.avgWaitMinutes} min</span>
          </div>
          <div className="flex justify-between gap-2">
            <span>Utilization</span>
            <span className="font-bold tabular-nums">{formatPercent(backtest.staticSchedule.vehicleUtilization)}</span>
          </div>
        </div>
        <div className="rounded-xl bg-clay-50 p-2.5">
          <div className="font-bold uppercase tracking-wide text-clay-700">GramRoute AI</div>
          <div className="mt-1 flex justify-between gap-2">
            <span>Stranded</span>
            <span className="font-bold tabular-nums">{backtest.gramRoute.strandedTrips}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span>Average wait</span>
            <span className="font-bold tabular-nums">{backtest.gramRoute.avgWaitMinutes} min</span>
          </div>
          <div className="flex justify-between gap-2">
            <span>Utilization</span>
            <span className="font-bold tabular-nums">{formatPercent(backtest.gramRoute.vehicleUtilization)}</span>
          </div>
        </div>
      </div>

      <p className="mt-2 rounded-xl border border-forest-100 bg-white p-2.5 text-[11px] leading-relaxed text-forest-700">
        {backtest.summary} Seed {backtest.seed} · {backtest.days} days.
      </p>

      <button
        type="button"
        className="link-quiet mt-2 text-[11px]"
        onClick={() => setShowDays((previous) => !previous)}
        aria-expanded={showDays}
      >
        {showDays ? 'Hide daily backtest table' : 'Show daily backtest table'}
      </button>
      {showDays ? (
        <div className="scrollbar-thin mt-2 max-h-64 overflow-auto rounded-xl border border-forest-100">
          <table className="w-full text-left text-[11px]">
            <caption className="sr-only">Daily simulated backtest results</caption>
            <thead className="sticky top-0 bg-forest-50 text-forest-700">
              <tr>
                <th scope="col" className="p-1.5">Day</th>
                <th scope="col" className="p-1.5">Demand</th>
                <th scope="col" className="p-1.5">Disruption</th>
                <th scope="col" className="p-1.5">Static stranded</th>
                <th scope="col" className="p-1.5">GramRoute stranded</th>
              </tr>
            </thead>
            <tbody>
              {backtest.daily.map((day) => (
                <tr key={day.day} className="border-t border-forest-50">
                  <td className="p-1.5">{day.day}</td>
                  <td className="p-1.5 tabular-nums">{day.demand}</td>
                  <td className="p-1.5">{day.disruption}</td>
                  <td className="p-1.5 tabular-nums">{day.staticStranded}</td>
                  <td className="p-1.5 tabular-nums">{day.gramStranded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="mt-2 text-[10px] leading-relaxed text-forest-500">
        Deterministic for seed {state.seed}. Results are a simulation of operating strategies, not a
        guarantee of real-world performance.
      </p>
    </section>
  );
}
