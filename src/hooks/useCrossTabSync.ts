import { useEffect, useRef } from 'react';
import type { Dispatch } from 'react';
import type { MobilityState, PersistenceEnvelope, StorageLike } from '../types/mobility';
import type { MobilityAction } from '../state/actions';
import { saveState, STATE_SCHEMA_VERSION, STORAGE_KEY, validateMobilityState } from '../state/persistence';

const CHANNEL_NAME = 'gramroute-ai-sync';

export function browserStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Browser-only cross-tab synchronization for the demo.
 *
 * The control-center tab is the authoritative dispatch writer. Student tabs
 * submit requests and consent actions. State snapshots are accepted only when
 * their monotonic version is newer, which rejects stale writes. Browser storage
 * and BroadcastChannel are not a substitute for server-side transactions.
 */
export function useCrossTabSync(
  state: MobilityState,
  dispatch: Dispatch<MobilityAction>,
): void {
  const lastBroadcast = useRef(0);

  useEffect(() => {
    const storage = browserStorage();
    if (storage) saveState(storage, state, new Date().toISOString());
    if (lastBroadcast.current === state.version) return;
    lastBroadcast.current = state.version;
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({ type: 'state', version: state.version, state });
      channel.close();
    } catch {
      // BroadcastChannel may be unavailable in privacy modes; persistence still works.
    }
  }, [state]);

  useEffect(() => {
    const accept = (incoming: unknown): void => {
      if (!incoming || typeof incoming !== 'object') return;
      const candidate = incoming as Partial<PersistenceEnvelope>;
      if (candidate.version !== STATE_SCHEMA_VERSION || !validateMobilityState(candidate.state)) return;
      if (candidate.state.version <= state.version) return;
      dispatch({ type: 'syncState', state: candidate.state });
    };

    const onStorage = (event: StorageEvent): void => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        accept(JSON.parse(event.newValue));
      } catch {
        // Ignore malformed cross-tab payloads.
      }
    };

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = (event: MessageEvent) => accept(event.data);
      } catch {
        channel = null;
      }
    }
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      channel?.close();
    };
  }, [dispatch, state.version]);
}
