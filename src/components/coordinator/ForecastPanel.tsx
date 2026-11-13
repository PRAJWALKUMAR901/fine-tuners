import { useMemo, useState } from 'react';
import { CalendarDays, TrendingUp } from 'lucide-react';
import type { MobilityState } from '../../types/mobility';
import { forecastDemand } from '../../services/forecasting';
import { ForecastChart } from '../charts/ForecastChart';

interface ForecastPanelProps {
  state: MobilityState;
  t: (key: string) => string;
}

export function ForecastPanel({ state, t }: ForecastPanelProps) {
  const [villageId, setVillageId] = useState(
    state.stops.find((stop) => stop.id === 'adyar')?.id ?? state.stops[0]?.id ?? '',
  );
  const village = state.stops.find((stop) => stop.id === villageId);

  const forecast = useMemo(
    () =>
      forecastDemand({
        seed: state.seed,
        villageId,
        baseline: Math.max(6, (village?.seededWaiting ?? 3) * 9),
        alpha: 0.4,
        horizonDays: 7,
        flags: {
          examDay: state.examDay,
          santheDay: state.santheDay,
          monsoon: state.monsoon,
          festival: state.festival,
        },
      }),
    [state.seed, state.examDay, state.santheDay, state.monsoon, state.festival, villageId, village?.seededWaiting],
  );

  const next = forecast.points[0];

  return (
    <section className="card p-4" aria-labelledby="forecast-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="forecast-heading" className="panel-title flex items-center gap-2">
            <TrendingUp size={16} className="text-forest-600" aria-hidden="true" />
            {t('coordinator.forecast')}
          </h2>
          <p className="text-xs text-forest-600">
            Exponential smoothing (α = 0.4) over synthetic history. Not a trained ML model.
          </p>
        </div>
        <span className="chip bg-clay-100 text-clay-800">Simulated</span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label>
          <span className="label">Village demand series</span>
          <select className="field" value={villageId} onChange={(event) => setVillageId(event.target.value)}>
            {state.stops.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.name}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-xl border border-forest-100 bg-forest-50/60 p-2.5">
          <div className="stat-label flex items-center gap-1">
            <CalendarDays size={12} aria-hidden="true" /> Tomorrow&apos;s simulated demand
          </div>
          <div className="text-xl font-black tabular-nums text-forest-950">
            {next?.predicted ?? 0} students
          </div>
          <div className="text-[11px] text-forest-600">
            Range {next?.lower ?? 0}–{next?.upper ?? 0} · confidence {Math.round((next?.confidence ?? 0) * 100)}%
          </div>
        </div>
      </div>

      <div className="mt-3">
        <ForecastChart result={forecast} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="chip bg-forest-100 text-forest-700">Baseline {forecast.baseline}</span>
        <span className="chip bg-forest-100 text-forest-700">α {forecast.alpha}</span>
        {state.examDay ? <span className="chip bg-amber-100 text-amber-900">Exam ×1.35</span> : null}
        {state.santheDay ? <span className="chip bg-clay-100 text-clay-800">Santhe ×1.20</span> : null}
        {state.monsoon ? <span className="chip bg-sky-100 text-sky-800">Monsoon ×1.15</span> : null}
        {state.festival ? <span className="chip bg-clay-100 text-clay-800">Festival ×1.40</span> : null}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-forest-500">
        All history and forecasts are generated deterministically from seed {state.seed}. Confidence
        bands are approximately ±15% and widen with horizon. Do not interpret as real-world accuracy.
      </p>
    </section>
  );
}
