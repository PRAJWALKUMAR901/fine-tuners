import type {
  Dispatch,
  DispatchStatus,
  Language,
  MobilityState,
  StudentPing,
} from '../types/mobility';

export interface ActionMeta {
  actionId?: string;
  baseVersion?: number;
}

export type DisruptionKind =
  | 'bus-breakdown'
  | 'exam-surge'
  | 'exam-crisis'
  | 'heavy-rain'
  | 'route-cancellation';

export type MobilityAction = (
  | { type: 'tick' }
  | { type: 'setClock'; running: boolean }
  | { type: 'setLanguage'; language: Language }
  | { type: 'setView'; view: 'student' | 'coordinator' }
  | { type: 'setScenario'; scenarioId: string }
  | { type: 'reset'; scenarioId?: string }
  | { type: 'triggerDisruption'; kind: DisruptionKind }
  | { type: 'reportBusIssue'; routeId: string; issue: 'full' | 'breakdown' }
  | { type: 'safetyAlert'; message: string; dispatchId?: string }
  | {
      type: 'requestPing';
      villageId: string;
      destinationCollegeId: string;
      source: StudentPing['source'];
      studentAlias?: string;
      note?: string;
    }
  | { type: 'matchPlan'; planId: string }
  | { type: 'confirmConsent'; dispatchId: string; otp: string }
  | { type: 'approveDispatch'; dispatchId: string }
  | { type: 'startTrip'; dispatchId: string }
  | { type: 'completeTrip'; dispatchId: string }
  | { type: 'cancelDispatch'; dispatchId: string; reason: string }
  | { type: 'setDemo'; active: boolean; step?: number; playing?: boolean }
  | { type: 'setDemoStep'; step: number; playing: boolean }
  | { type: 'syncState'; state: MobilityState }
) &
  ActionMeta;

/** Strict lifecycle transitions for a dispatch. */
export const DISPATCH_TRANSITIONS: Record<DispatchStatus, DispatchStatus[]> = {
  requested: ['matched', 'cancelled'],
  matched: ['guardian_consented', 'approved', 'cancelled'],
  guardian_consented: ['approved', 'cancelled'],
  approved: ['dispatched', 'cancelled'],
  dispatched: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransition(from: DispatchStatus, to: DispatchStatus): boolean {
  return DISPATCH_TRANSITIONS[from].includes(to);
}

export function nextDispatchStatus(dispatch: Dispatch): DispatchStatus | null {
  switch (dispatch.status) {
    case 'requested':
      return 'matched';
    case 'matched':
      return dispatch.consent.required ? 'guardian_consented' : 'approved';
    case 'guardian_consented':
      return 'approved';
    case 'approved':
      return 'dispatched';
    case 'dispatched':
      return 'completed';
    default:
      return null;
  }
}

export const actionCreators = {
  tick: (): MobilityAction => ({ type: 'tick' }),
  setClock: (running: boolean): MobilityAction => ({ type: 'setClock', running }),
  setLanguage: (language: Language): MobilityAction => ({ type: 'setLanguage', language }),
  setView: (view: 'student' | 'coordinator'): MobilityAction => ({ type: 'setView', view }),
  setScenario: (scenarioId: string): MobilityAction => ({ type: 'setScenario', scenarioId }),
  reset: (scenarioId?: string): MobilityAction => ({ type: 'reset', scenarioId }),
  triggerDisruption: (kind: DisruptionKind): MobilityAction => ({ type: 'triggerDisruption', kind }),
  reportBusIssue: (routeId: string, issue: 'full' | 'breakdown'): MobilityAction => ({
    type: 'reportBusIssue',
    routeId,
    issue,
  }),
  safetyAlert: (message: string, dispatchId?: string): MobilityAction => ({
    type: 'safetyAlert',
    message,
    dispatchId,
  }),
  requestPing: (
    villageId: string,
    destinationCollegeId: string,
    source: StudentPing['source'],
    studentAlias?: string,
    note?: string,
  ): MobilityAction => ({
    type: 'requestPing',
    villageId,
    destinationCollegeId,
    source,
    studentAlias,
    note,
  }),
  matchPlan: (planId: string): MobilityAction => ({ type: 'matchPlan', planId }),
  confirmConsent: (dispatchId: string, otp: string): MobilityAction => ({
    type: 'confirmConsent',
    dispatchId,
    otp,
  }),
  approveDispatch: (dispatchId: string, baseVersion?: number): MobilityAction => ({
    type: 'approveDispatch',
    dispatchId,
    baseVersion,
  }),
  startTrip: (dispatchId: string): MobilityAction => ({ type: 'startTrip', dispatchId }),
  completeTrip: (dispatchId: string): MobilityAction => ({ type: 'completeTrip', dispatchId }),
  cancelDispatch: (dispatchId: string, reason: string): MobilityAction => ({
    type: 'cancelDispatch',
    dispatchId,
    reason,
  }),
  setDemo: (active: boolean, step = 0, playing = false): MobilityAction => ({
    type: 'setDemo',
    active,
    step,
    playing,
  }),
  setDemoStep: (step: number, playing: boolean): MobilityAction => ({
    type: 'setDemoStep',
    step,
    playing,
  }),
};

export function makeActionId(prefix: string, seed: number, counter: number): string {
  return `${prefix}_${seed}_${counter}`;
}

export function activeDispatchForCluster(dispatches: Dispatch[], clusterId: string): Dispatch | undefined {
  return dispatches.find(
    (dispatch) => dispatch.clusterId === clusterId && dispatch.status !== 'cancelled',
  );
}

export function findActivePing(
  state: MobilityState,
  studentAlias: string,
  villageId: string,
  destinationCollegeId: string,
): StudentPing | undefined {
  return state.pings.find(
    (ping) =>
      ping.studentAlias === studentAlias &&
      ping.villageId === villageId &&
      ping.destinationCollegeId === destinationCollegeId &&
      (ping.status === 'waiting' || ping.status === 'clustered'),
  );
}
