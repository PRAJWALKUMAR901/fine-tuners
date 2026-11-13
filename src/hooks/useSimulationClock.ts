import { useEffect } from 'react';
import type { Dispatch } from 'react';
import { TICK_MS } from '../utils/simulationClock';
import { actionCreators, type MobilityAction } from '../state/actions';

/**
 * The only simulation clock in the application. One tick every 3 real seconds
 * advances one simulated minute. Components never start their own clock.
 */
export function useSimulationClock(
  running: boolean,
  dispatch: Dispatch<MobilityAction>,
): void {
  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      dispatch(actionCreators.tick());
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [running, dispatch]);
}
