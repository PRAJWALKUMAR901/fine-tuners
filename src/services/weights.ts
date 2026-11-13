/**
 * Optimization weights. All weights sum to exactly 1 and all normalized
 * utilities point the same way: higher is better.
 */
export const OPTIMIZATION_WEIGHTS = {
  cost: 0.25,
  eta: 0.15,
  reliability: 0.2,
  detour: 0.2,
  seatFit: 0.1,
  verification: 0.1,
} as const;

export type OptimizationWeights = typeof OPTIMIZATION_WEIGHTS;

export function weightsSum(weights: OptimizationWeights): number {
  return (
    weights.cost +
    weights.eta +
    weights.reliability +
    weights.detour +
    weights.seatFit +
    weights.verification
  );
}

/** A deterministic, capacity-aware score in 0..1. */
export function scoreUtilities(
  utilities: {
    cost: number;
    eta: number;
    reliability: number;
    detour: number;
    seatFit: number;
    verification: number;
  },
  weights: OptimizationWeights = OPTIMIZATION_WEIGHTS,
): number {
  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  return (
    weights.cost * clamp(utilities.cost) +
    weights.eta * clamp(utilities.eta) +
    weights.reliability * clamp(utilities.reliability) +
    weights.detour * clamp(utilities.detour) +
    weights.seatFit * clamp(utilities.seatFit) +
    weights.verification * clamp(utilities.verification)
  );
}

export const VERIFICATION_SCORE = {
  'ID-verified': 1,
  'Depot-registered': 0.85,
  'Community-vouched': 0.6,
  Unverified: 0.15,
} as const;
