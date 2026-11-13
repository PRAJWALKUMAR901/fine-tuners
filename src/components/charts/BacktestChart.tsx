import type { BacktestResult } from '../../types/mobility';

interface BacktestChartProps {
  result: BacktestResult;
}

export function BacktestChart({ result }: BacktestChartProps) {
  const width = 760;
  const height = 230;
  const padding = { left: 34, right: 8, top: 20, bottom: 30 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxStranded = Math.max(
    1,
    ...result.daily.map((day) => Math.max(day.staticStranded, day.gramStranded)),
  );
  const groupWidth = plotWidth / result.daily.length;
  const barWidth = Math.max(2, Math.min(8, groupWidth / 2.6));
  const yFor = (value: number): number =>
    padding.top + plotHeight - (value / maxStranded) * plotHeight;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-forest-700">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-forest-300" /> Static KSRTC schedule
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-clay-500" /> GramRoute AI
        </span>
        <span className="text-forest-500">Daily stranded trips · 30 simulated days</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-1 h-auto w-full"
        role="img"
        aria-labelledby="backtest-chart-title backtest-chart-desc"
      >
        <title id="backtest-chart-title">Simulated 30-day backtest comparison</title>
        <desc id="backtest-chart-desc">
          Grouped bars comparing daily stranded trips under a static schedule and GramRoute AI.
          GramRoute prevented {result.strandedTripsPrevented} stranded trips over the simulation.
        </desc>
        {[0, 0.5, 1].map((fraction) => {
          const y = yFor(maxStranded * fraction);
          return (
            <g key={`grid-${fraction}`}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e5e7e3" />
              <text x={padding.left - 6} y={y + 3} textAnchor="end" className="fill-forest-500 text-[9px]">
                {Math.round(maxStranded * fraction)}
              </text>
            </g>
          );
        })}
        {result.daily.map((day, index) => {
          const x = padding.left + index * groupWidth + groupWidth / 2;
          return (
            <g key={`day-${day.day}`}>
              <rect
                x={x - barWidth - 1}
                y={yFor(day.staticStranded)}
                width={barWidth}
                height={Math.max(1, padding.top + plotHeight - yFor(day.staticStranded))}
                rx="1"
                fill="#92be9f"
              >
                <title>{`Day ${day.day} · static schedule: ${day.staticStranded} stranded · ${day.disruption}`}</title>
              </rect>
              <rect
                x={x + 1}
                y={yFor(day.gramStranded)}
                width={barWidth}
                height={Math.max(1, padding.top + plotHeight - yFor(day.gramStranded))}
                rx="1"
                fill="#c17c3e"
              >
                <title>{`Day ${day.day} · GramRoute AI: ${day.gramStranded} stranded · ${day.disruption}`}</title>
              </rect>
              {day.day % 5 === 0 ? (
                <text x={x} y={height - 12} textAnchor="middle" className="fill-forest-500 text-[9px]">
                  D{day.day}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
