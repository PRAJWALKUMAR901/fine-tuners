import { describe, expect, it } from 'vitest';
import { forecastDemand, generateHistory, seasonalFactor } from '../src/services/forecasting';
import { runBacktest } from '../src/services/backtest';

describe('demand forecasting', () => {
  it('is deterministic for a given seed and input', () => {
    const first = forecastDemand({ seed: 42, villageId: 'adyar', baseline: 45, horizonDays: 7 });
    const second = forecastDemand({ seed: 42, villageId: 'adyar', baseline: 45, horizonDays: 7 });
    expect(first).toEqual(second);
    expect(generateHistory(42, 'adyar', 45)).toEqual(generateHistory(42, 'adyar', 45));
  });

  it('produces ordered confidence bands around every prediction', () => {
    const result = forecastDemand({ seed: 7, villageId: 'vittla', baseline: 30, horizonDays: 7 });
    expect(result.points).toHaveLength(7);
    for (const point of result.points) {
      expect(point.lower).toBeLessThanOrEqual(point.predicted);
      expect(point.upper).toBeGreaterThanOrEqual(point.predicted);
      expect(point.confidence).toBeGreaterThan(0);
      expect(point.confidence).toBeLessThanOrEqual(1);
      expect(point.lower).toBeGreaterThanOrEqual(Math.round(point.predicted * 0.84));
      expect(point.upper).toBeLessThanOrEqual(Math.round(point.predicted * 1.18));
    }
    expect(result.simulated).toBe(true);
  });

  it('applies exam, santhe, monsoon and festival seasonal modifiers', () => {
    expect(seasonalFactor({ examDay: true })).toBeGreaterThan(1);
    expect(seasonalFactor({ santheDay: true })).toBeGreaterThan(1);
    expect(seasonalFactor({ monsoon: true })).toBeGreaterThan(1);
    expect(seasonalFactor({ festival: true })).toBeGreaterThan(
      seasonalFactor({ examDay: true }),
    );
    const normal = forecastDemand({ seed: 11, villageId: 'adyar', baseline: 40, horizonDays: 1 });
    const exam = forecastDemand({
      seed: 11,
      villageId: 'adyar',
      baseline: 40,
      horizonDays: 1,
      flags: { examDay: true },
    });
    expect(exam.points[0].predicted).toBeGreaterThanOrEqual(normal.points[0].predicted);
    expect(exam.points[0].seasonalFactor).toBeGreaterThanOrEqual(normal.points[0].seasonalFactor);
  });

  it('uses the requested alpha and synthetic history length', () => {
    const result = forecastDemand({
      seed: 3,
      villageId: 'bantwal',
      baseline: 25,
      alpha: 0.2,
      horizonDays: 5,
    });
    expect(result.alpha).toBe(0.2);
    expect(result.historical).toHaveLength(30);
    expect(result.points).toHaveLength(5);
  });
});

describe('30-day simulated backtest', () => {
  it('is deterministic for a given seed', () => {
    const first = runBacktest({ seed: 2026, days: 30 });
    const second = runBacktest({ seed: 2026, days: 30 });
    expect(first).toEqual(second);
    expect(first.daily).toHaveLength(30);
    expect(first.simulated).toBe(true);
  });

  it('uses identical seeded demand for both strategies', () => {
    const result = runBacktest({ seed: 99, days: 30 });
    for (const day of result.daily) {
      expect(day.demand).toBeGreaterThan(0);
      expect(day.gramStranded).toBeLessThanOrEqual(day.staticStranded);
    }
    const totalStatic = result.daily.reduce((sum, day) => sum + day.staticStranded, 0);
    expect(totalStatic).toBe(result.staticSchedule.strandedTrips);
    expect(result.strandedTripsPrevented).toBeGreaterThan(0);
    expect(result.estimatedCostSavings).toBeGreaterThan(0);
  });

  it('changes results when the seed changes, without claiming real-world accuracy', () => {
    const first = runBacktest({ seed: 100, days: 30 });
    const second = runBacktest({ seed: 101, days: 30 });
    expect(first.summary).toContain('simulated');
    expect(second.summary).toContain('simulated');
    expect(first.daily).not.toEqual(second.daily);
  });
});
