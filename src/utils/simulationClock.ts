/**
 * Centralized simulation clock constants and pure time helpers.
 * One tick = 3 real seconds = 1 simulated minute, driven by a single hook in App.
 */

export const TICK_MS = 3000;
export const SIM_MINUTES_PER_TICK = 1;
export const PING_TTL_MINUTES = 20;
export const CLUSTER_WINDOW_MINUTES = 10;
export const SIM_START_MINUTES = 7 * 60 + 45;
export const DEMO_DURATION_SECONDS = 90;

export function elapsedMinutes(now: number, since: number): number {
  return Math.max(0, now - since);
}

export function isPingExpired(now: number, expiresAt: number): boolean {
  return now >= expiresAt;
}

export function timeframe(minutes: number): string {
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1)} hr`;
}
