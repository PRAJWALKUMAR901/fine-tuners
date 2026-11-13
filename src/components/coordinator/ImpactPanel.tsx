import { ArrowRight, Clock3, IndianRupee, Route, TrendingUp, Users } from 'lucide-react';
import type { BacktestResult, MobilityState } from '../../types/mobility';
import { formatCurrency, formatPercent } from '../../utils/formatters';

interface ImpactPanelProps {
  state: MobilityState;
  backtest: BacktestResult;
  t: (key: string) => string;
}

export function ImpactPanel({ state, backtest, t }: ImpactPanelProps) {
  const { impact } = state;
  const actualStats = [
    { label: t('impact.rescued'), value: String(impact.studentsRescued), icon: Users, hint: 'completed trips only' },
    { label: t('impact.saved'), value: formatCurrency(impact.rupeesSaved), icon: IndianRupee, hint: 'estimated shared-fare savings' },
    { label: t('impact.wait'), value: `${impact.waitingMinutesSaved}`, icon: Clock3, hint: 'vs. 55-minute baseline wait' },
    { label: t('impact.trips'), value: String(impact.tripsCompleted), icon: Route, hint: 'dispatch lifecycle completed' },
    { label: t('impact.util'), value: formatPercent(impact.vehicleUtilization), icon: TrendingUp, hint: 'students rescued / fleet seats per trip' },
  ];

  return (
    <section className="card overflow-hidden" aria-labelledby="impact-heading">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-forest-100 px-4 py-3">
        <div>
          <h2 id="impact-heading" className="panel-title">
            {t('coordinator.impact')}
          </h2>
          <p className="text-xs text-forest-600">
            Actual metrics move only when a dispatch reaches <strong>completed</strong>.
          </p>
        </div>
        <span className="chip bg-forest-100 text-forest-800">Actual</span>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
        {actualStats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-forest-100 bg-forest-50/60 p-3">
            <stat.icon size={15} className="text-forest-600" aria-hidden="true" />
            <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-forest-600">
              {stat.label}
            </div>
            <div className="text-xl font-black tabular-nums text-forest-950">{stat.value}</div>
            <div className="text-[10px] text-forest-500">{stat.hint}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-forest-100 bg-forest-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="card-heading">30-day projection · simulated backtest</h3>
          <span className="chip bg-clay-100 text-clay-800">Projected, not actual</span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-forest-200 bg-white p-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-forest-500">
              Without GramRoute · static KSRTC schedule
            </div>
            <dl className="mt-1 space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-forest-600">Stranded trips</dt>
                <dd className="font-bold tabular-nums">{backtest.staticSchedule.strandedTrips}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-forest-600">Average wait</dt>
                <dd className="font-bold tabular-nums">{backtest.staticSchedule.avgWaitMinutes} min</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-forest-600">Vehicle utilization</dt>
                <dd className="font-bold tabular-nums">{formatPercent(backtest.staticSchedule.vehicleUtilization)}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border border-clay-200 bg-clay-50 p-3">
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-clay-700">
              With GramRoute AI <ArrowRight size={11} aria-hidden="true" /> simulated
            </div>
            <dl className="mt-1 space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-clay-800">Stranded trips</dt>
                <dd className="font-bold tabular-nums">{backtest.gramRoute.strandedTrips}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-clay-800">Average wait</dt>
                <dd className="font-bold tabular-nums">{backtest.gramRoute.avgWaitMinutes} min</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-clay-800">Vehicle utilization</dt>
                <dd className="font-bold tabular-nums">{formatPercent(backtest.gramRoute.vehicleUtilization)}</dd>
              </div>
            </dl>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-forest-600">
          Projection source: deterministic 30-day seeded simulation. Actual demo impact above is
          tracked separately from completed dispatches.
        </p>
      </div>
    </section>
  );
}
