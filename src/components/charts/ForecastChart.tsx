import type { ForecastResult } from '../../types/mobility';

interface ForecastChartProps {
  result: ForecastResult;
}

export function ForecastChart({ result }: ForecastChartProps) {
  const history = result.historical.slice(-14);
  const labels = [
    ...history.map((point) => point.label),
    ...result.points.map((point) => point.label.replace('Day ', '')),
  ];
  const historyValues = history.map((point) => point.value);
  const historyXStart = 42;
  const chartWidth = 720;
  const historicalWidth = 210;
  const forecastWidth = chartWidth - historicalWidth;
  const width = chartWidth + 58;
  const height = 250;
  const top = 18;
  const bottom = 34;
  const maxValue = Math.max(
    ...historyValues,
    ...result.points.map((point) => point.upper),
    1,
  ) * 1.12;
  const plotHeight = height - top - bottom;
  const xForHistory = (index: number): number =>
    historyXStart + (index / Math.max(1, history.length - 1)) * historicalWidth;
  const xForForecast = (index: number): number =>
    historyXStart + historicalWidth + (index / Math.max(1, result.points.length - 1)) * forecastWidth;
  const yFor = (value: number): number => top + plotHeight - (value / maxValue) * plotHeight;
  const bandPoints = [
    ...result.points.map((point, index) => `${xForForecast(index)},${yFor(point.upper)}`),
    ...[...result.points].reverse().map((point, reversedIndex) => {
      const index = result.points.length - 1 - reversedIndex;
      return `${xForForecast(index)},${yFor(point.lower)}`;
    }),
  ].join(' ');
  const historyPath = historyValues
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${xForHistory(index)},${yFor(value)}`)
    .join(' ');
  const forecastPath = result.points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${xForForecast(index)},${yFor(point.predicted)}`)
    .join(' ');

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-labelledby="forecast-chart-title forecast-chart-desc"
      >
        <title id="forecast-chart-title">Simulated 7-day demand forecast</title>
        <desc id="forecast-chart-desc">
          Historical simulated demand for the last fourteen days, followed by a seven-day smoothed
          forecast with a fifteen percent confidence band. Latest forecast: {result.points[0]?.predicted ?? 0} students.
        </desc>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const value = maxValue * fraction;
          const y = yFor(value);
          return (
            <g key={`grid-${fraction}`}>
              <line x1={historyXStart} x2={historyXStart + chartWidth} y1={y} y2={y} stroke="#e5e7e3" strokeWidth="1" />
              <text x={historyXStart - 8} y={y + 3} textAnchor="end" className="fill-forest-500 text-[9px]">
                {Math.round(value)}
              </text>
            </g>
          );
        })}
        <line
          x1={historyXStart + historicalWidth}
          x2={historyXStart + historicalWidth}
          y1={top}
          y2={height - bottom}
          stroke="#c17c3e"
          strokeDasharray="4 4"
          strokeWidth="1.5"
        />
        <text x={historyXStart + historicalWidth - 4} y={top + 9} textAnchor="end" className="fill-forest-500 text-[9px] font-bold uppercase">
          Simulated history
        </text>
        <text x={historyXStart + historicalWidth + 6} y={top + 9} className="fill-clay-700 text-[9px] font-bold uppercase">
          Forecast
        </text>
        <polygon points={bandPoints} fill="#e9b96e" opacity="0.22" />
        <path d={historyPath} fill="none" stroke="#7ca189" strokeWidth="2" />
        <path d={forecastPath} fill="none" stroke="#b45309" strokeWidth="2.5" strokeLinejoin="round" />
        {result.points.map((point, index) => (
          <g key={`forecast-point-${point.label}`}>
            <circle cx={xForForecast(index)} cy={yFor(point.predicted)} r="3" fill="#b45309" />
            <title>{`${point.label}: ${point.predicted} students (${point.lower}–${point.upper}), seasonal factor ${point.seasonalFactor}`}</title>
          </g>
        ))}
        {labels.map((label, index) => {
          if (index % Math.ceil(labels.length / 7) !== 0) return null;
          const x = index < history.length ? xForHistory(index) : xForForecast(index - history.length);
          return (
            <text key={`label-${label}-${index}`} x={x} y={height - 12} textAnchor="middle" className="fill-forest-500 text-[9px]">
              {label}
            </text>
          );
        })}
      </svg>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold text-forest-700">
          Forecast data table
        </summary>
        <table className="mt-2 w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-forest-100 text-forest-600">
              <th scope="col" className="py-1">Day</th>
              <th scope="col" className="py-1">Predicted</th>
              <th scope="col" className="py-1">Lower</th>
              <th scope="col" className="py-1">Upper</th>
              <th scope="col" className="py-1">Seasonal</th>
              <th scope="col" className="py-1">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {result.points.map((point) => (
              <tr key={`row-${point.label}`} className="border-b border-forest-50">
                <td className="py-1">{point.label}</td>
                <td className="py-1 font-semibold">{point.predicted}</td>
                <td className="py-1">{point.lower}</td>
                <td className="py-1">{point.upper}</td>
                <td className="py-1">×{point.seasonalFactor.toFixed(2)}</td>
                <td className="py-1">{Math.round(point.confidence * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
