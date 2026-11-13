/**
 * Deterministic seeded pseudo-randomness (mulberry32).
 * Same seed + same call order always yields the same sequence.
 */

export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type RandomSource = () => number;

export function createSeededRandom(seed: number | string): RandomSource {
  let a = (typeof seed === 'string' ? hashSeed(seed) : seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(random: RandomSource, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

/** Stable-ish deterministic ID in the demo namespace; uniqueness is guaranteed by a counter. */
export function makeId(prefix: string, seed: number | string, counter = 0): string {
  const digest = hashSeed(`${prefix}|${seed}|${counter}`).toString(36);
  return `${prefix}_${digest}`;
}
