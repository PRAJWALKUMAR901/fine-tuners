import { describe, expect, it } from 'vitest';
import type { MobilityState, PersistenceEnvelope, StorageLike } from '../src/types/mobility';
import { createRuntimeState, mobilityReducer } from '../src/state/mobilityReducer';
import { actionCreators } from '../src/state/actions';
import {
  clearState,
  loadState,
  saveState,
  STATE_SCHEMA_VERSION,
  STORAGE_KEY,
  validateMobilityState,
} from '../src/state/persistence';

class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

describe('schema-versioned persistence', () => {
  it('round-trips a valid state inside the versioned envelope', () => {
    const storage = new MemoryStorage();
    const state = createRuntimeState('normal');
    saveState(storage, state, '2026-01-01T00:00:00.000Z');
    const raw = storage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw ?? '{}') as PersistenceEnvelope;
    expect(envelope.version).toBe(STATE_SCHEMA_VERSION);
    expect(envelope.savedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(validateMobilityState(envelope.state)).toBe(true);

    const loaded = loadState(storage, 'normal');
    expect(loaded.source).toBe('storage');
    expect(loaded.state).toEqual(state);
  });

  it('falls back to seeded demo data on corrupt JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{not-json');
    const loaded = loadState(storage, 'normal');
    expect(loaded.source).toBe('seed');
    expect(loaded.reason).toBe('corrupt JSON');
    expect(loaded.state?.scenarioId).toBe('normal');
    expect(loaded.state?.version).toBe(1);
  });

  it('rejects unsupported schema versions', () => {
    const storage = new MemoryStorage();
    const state = createRuntimeState('normal');
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 99, savedAt: new Date().toISOString(), state }),
    );
    const loaded = loadState(storage, 'normal');
    expect(loaded.source).toBe('seed');
    expect(loaded.reason).toContain('unsupported');
  });

  it('resets when a required state field is missing', () => {
    const storage = new MemoryStorage();
    const state = createRuntimeState('normal');
    const broken = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    delete broken.pings;
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STATE_SCHEMA_VERSION, savedAt: new Date().toISOString(), state: broken }),
    );
    const loaded = loadState(storage, 'normal');
    expect(loaded.source).toBe('seed');
    expect(loaded.reason).toBe('state validation failed');
  });

  it('migrates a supported legacy envelope', () => {
    const storage = new MemoryStorage();
    const state = createRuntimeState('normal');
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 0,
        savedAt: new Date(0).toISOString(),
        state: { ...state, language: undefined, demo: undefined, appliedActionIds: undefined },
      }),
    );
    const loaded = loadState(storage, 'normal');
    expect(loaded.source).toBe('migrated');
    expect(loaded.state?.language).toBe('en');
    expect(loaded.state?.demo).toBeDefined();
    expect(loaded.state?.appliedActionIds).toEqual([]);
    expect(validateMobilityState(loaded.state)).toBe(true);
  });

  it('clears the persisted state on request', () => {
    const storage = new MemoryStorage();
    saveState(storage, createRuntimeState('normal'), new Date().toISOString());
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
    clearState(storage);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('seeded reset', () => {
  it('restores the exact initial seeded state after mutations', () => {
    const initial = createRuntimeState('normal');
    let state: MobilityState = initial;
    state = mobilityReducer(
      state,
      actionCreators.requestPing('adyar', 'clg-kothur', 'sms', state.studentProfile.alias),
    );
    state = mobilityReducer(state, actionCreators.triggerDisruption('heavy-rain'));
    state = mobilityReducer(state, actionCreators.triggerDisruption('bus-breakdown'));
    state = mobilityReducer(state, actionCreators.setLanguage('kn'));
    state = mobilityReducer(state, actionCreators.setClock(true));

    expect(state).not.toEqual(initial);
    const reset = mobilityReducer(state, actionCreators.reset('normal'));
    expect(reset).toEqual(initial);
    expect(reset.seed).toBe(initial.seed);
    expect(reset.version).toBe(1);
    expect(reset.appliedActionIds).toEqual([]);
  });

  it('deduplicates repeated action IDs across tabs', () => {
    const state = createRuntimeState('normal');
    const action = {
      ...actionCreators.requestPing('adyar', 'clg-kothur', 'app', state.studentProfile.alias),
      actionId: 'action-dedup-1',
    };
    const once = mobilityReducer(state, action);
    const twice = mobilityReducer(once, action);
    expect(twice).toBe(once);
    expect(once.pings.length).toBe(state.pings.length + 1);
  });
});
