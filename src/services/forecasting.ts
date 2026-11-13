import type { ForecastPoint, ForecastResult } from '../types/mobility';
import { createSeededRandom } from '../utils/seededRandom';

/**
 * Deterministic exponential-smoothing forecaster over synthetic history.
 * Nothing here is a trained ML model; all historical values are simulated.
 */

export const DEFAULT_ALPHA = 0.4;
export const CONFIDENCE_BAND = 0.15;
export const HISTORY_DAYS = 30;

export interface SeasonalFlags {
  examDay?: boolean;
  santheDay?: boolean;
  monsoon?: boolean;
  festival?: boolean;
}

export interface ForecastOptions {
  seed: number;
  villageId: string;
  baseline: number;
  alpha?: number;
  horizonDays?: number;
  flags?: SeasonalFlags;
}

export interface HistoryPoint {
  label: string;
  value: number;
}

export function seasonalFactor(flags: SeasonalFlags): number {
  let factor = 1;
  if (flags.examDay) factor *= 1.35;
  if (flags.santheDay) factor *= 1.2;
  if (flags.monsoon) factor *= 1.15;
  if (flags.festival) factor *= 1.4;
  return Math.round(factor * 100) / 100;
}

/**
 * Simulated demand history: baseline with seeded noise, a gentle weekly rhythm
 * and a small upward trend. The same seed always produces the same series.
 */
export function generateHistory(
  seed: number,
  villageId: string,
  baseline: number,
  days = HISTORY_DAYS,
): HistoryPoint[] {
  const random = createSeededRandom(`${seed}|${villageId}|history`);
  const points: HistoryPoint[] = [];
  let level = baseline;
  for (let index = days - 1; index >= 0; index -= 1) {
    const weekly = index % 7 === 0 ? 1.18 : index % 7 === 5 ? 0.82 : 1;
    const noise = 0.88 + random() * 0.24;
    const trend = 1 + (days - index) * 0.002;
    level = Math.max(1, baseline * weekly * noise * trend);
    points.push({
      label: `D-${index}`,
      value: Math.round(level),
    });
  }
  return points;
}

function smooth(history: number[], alpha: number): number {
  if (history.length === 0) return 0;
  let level = history[0];
  for (let index = 1; index < history.length; index += 1) {
    level = alpha * history[index] + (1 - alpha) * level;
  }
  return level;
}

/**
 * Forecasts the next `horizonDays`. Confidence bands are approximately ±15%
 * of the predicted value and widen slightly with horizon.
 */
export function forecastDemand(options: ForecastOptions): ForecastResult {
  const alpha = options.alpha ?? DEFAULT_ALPHA;
  const horizon = options.horizonDays ?? 7;
  const history = generateHistory(options.seed, options.villageId, options.baseline);
  const level = smooth(
    history.map((point) => point.value),
    alpha,
  );
  const flags = options.flags ?? {};
  const points: ForecastPoint[] = [];
  for (let day = 0; day < horizon; day += 1) {
    const isSanthe = flags.santheDay ? day % 3 === 0 : day === 2;
    const isExam = flags.examDay ? day < 3 : false;
    const isMonsoon = Boolean(flags.monsoon) || day === 4;
    const isFestival = Boolean(flags.festival) && day === 5;
    const factor = seasonalFactor({
      examDay: isExam,
      santheDay: isSanthe,
      monsoon: isMonsoon,
      festival: isFestival,
    });
    const predicted = Math.max(1, Math.round(level * factor));
    const widen = 1 + day * 0.01;
    const lower = Math.max(0, Math.round(predicted * (1 - CONFIDENCE_BAND * widen)));
    const upper = Math.round(predicted * (1 + CONFIDENCE_BAND * widen));
    points.push({
      label: `Day +${day + 1}`,
      predicted,
      lower,
      upper,
      seasonalFactor: factor,
      confidence: Math.round(Math.max(0.6, 0.92 - day * 0.035) * 100) / 100,
    });
  }

  return {
    villageId: options.villageId,
    generatedAt: 0,
    alpha,
    simulated: true,
    baseline: Math.round(level),
    points,
    historical: history,
  };
}
