import type { MobilityState, PersistenceEnvelope, StorageLike } from '../types/mobility';
import { createInitialState } from '../data/seedData';

/**
 * Versioned localStorage persistence.
 *
 * Envelope: { version, savedAt, state }. Unknown/corrupt payloads are rejected
 * so the caller can safely reset to seeded demo data. Browser-only persistence
 * is a demo mechanism, not a transactional backend.
 */

export const STATE_SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'gramroute-ai:demo-state';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const REQUIRED_ARRAY_FIELDS = [
  'stops',
  'colleges',
  'edges',
  'busRoutes',
  'buses',
  'pings',
  'clusters',
  'vehicles',
  'plans',
  'reallocations',
  'dispatches',
  'decisionLog',
  'appliedActionIds',
] as const;

export function validateMobilityState(value: unknown): value is MobilityState {
  if (!isRecord(value)) return false;
  if (typeof value.version !== 'number' || !Number.isFinite(value.version)) return false;
  if (typeof value.seed !== 'number' || typeof value.scenarioId !== 'string') return false;
  if (typeof value.simMinutes !== 'number' || !Number.isFinite(value.simMinutes)) return false;
  if (typeof value.language !== 'string' || typeof value.view !== 'string') return false;
  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!Array.isArray(value[field])) return false;
  }
  if (!isRecord(value.impact) || !isRecord(value.studentProfile) || !isRecord(value.demo)) {
    return false;
  }
  if (!isRecord(value.lastTickDemand)) return false;
  return true;
}

type Migration = (state: MobilityState) => MobilityState;

/** Migrations are applied in order from the envelope's version to current. */
const MIGRATIONS: Record<number, Migration> = {
  // Version 0 → 1: legacy exports lacked language/view/demo scaffolding.
  0: (state) => ({
    ...state,
    version: 1,
    language: state.language ?? 'en',
    view: state.view ?? 'coordinator',
    demo: state.demo ?? { active: false, step: 0, totalSteps: 12, playing: false },
    appliedActionIds: state.appliedActionIds ?? [],
    reallocations: state.reallocations ?? [],
  }),
};

export interface LoadResult {
  state: MobilityState | null;
  source: 'storage' | 'seed' | 'migrated';
  reason?: string;
}

export function migrateEnvelope(envelope: PersistenceEnvelope): {
  envelope: PersistenceEnvelope;
  migrated: boolean;
} {
  let version = envelope.version;
  let state = envelope.state;
  let migrated = false;
  while (version < STATE_SCHEMA_VERSION) {
    const migration = MIGRATIONS[version];
    if (!migration) break;
    state = migration(state);
    version += 1;
    migrated = true;
  }
  return { envelope: { ...envelope, version, state }, migrated };
}

export function saveState(
  storage: StorageLike,
  state: MobilityState,
  savedAt: string,
): void {
  const envelope: PersistenceEnvelope = {
    version: STATE_SCHEMA_VERSION,
    savedAt,
    state,
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

export function clearState(storage: StorageLike): void {
  storage.removeItem(STORAGE_KEY);
}

export function loadState(storage: StorageLike, scenarioId: string): LoadResult {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return { state: createInitialState(scenarioId), source: 'seed', reason: 'no saved state' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: createInitialState(scenarioId), source: 'seed', reason: 'corrupt JSON' };
  }
  if (!isRecord(parsed)) {
    return { state: createInitialState(scenarioId), source: 'seed', reason: 'invalid envelope' };
  }

  // Migrate a legacy bare state object by wrapping it in an envelope.
  const candidate: PersistenceEnvelope = isRecord(parsed.state)
    ? (parsed as unknown as PersistenceEnvelope)
    : {
        version: 0,
        savedAt: new Date(0).toISOString(),
        state: parsed as unknown as MobilityState,
      };

  if (typeof candidate.version !== 'number' || candidate.version > STATE_SCHEMA_VERSION) {
    return {
      state: createInitialState(scenarioId),
      source: 'seed',
      reason: `unsupported schema version ${String(candidate.version)}`,
    };
  }
  const { envelope, migrated } = migrateEnvelope(candidate);
  if (envelope.version !== STATE_SCHEMA_VERSION) {
    return {
      state: createInitialState(scenarioId),
      source: 'seed',
      reason: 'no migration path',
    };
  }
  if (!validateMobilityState(envelope.state)) {
    return { state: createInitialState(scenarioId), source: 'seed', reason: 'state validation failed' };
  }
  return {
    state: migrated ? { ...envelope.state, scenarioId } : envelope.state,
    source: migrated ? 'migrated' : 'storage',
  };
}

/** Convenience loader that always returns a usable state (seeded on failure). */
export function loadOrSeed(storage: StorageLike, scenarioId: string): MobilityState {
  return loadState(storage, scenarioId).state ?? createInitialState(scenarioId);
}
