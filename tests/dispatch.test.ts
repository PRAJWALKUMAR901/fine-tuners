import { describe, expect, it } from 'vitest';
import type { MobilityState } from '../src/types/mobility';
import {
  createRuntimeState,
  mobilityReducer,
} from '../src/state/mobilityReducer';
import { actionCreators } from '../src/state/actions';

function prepareMeenaDispatch(): {
  state: MobilityState;
  dispatch: ReturnType<typeof createRuntimeState>['dispatches'][number];
  planId: string;
} {
  let state = createRuntimeState('normal');
  state = mobilityReducer(
    state,
    actionCreators.requestPing('adyar', 'clg-kothur', 'sms', state.studentProfile.alias),
  );
  const cluster = state.clusters.find((candidate) => candidate.villageId === 'adyar');
  if (!cluster) throw new Error('expected Adyar cluster');
  const plan = state.plans.find(
    (candidate) => candidate.clusterId === cluster.id && candidate.feasibilityStatus !== 'infeasible',
  );
  if (!plan) throw new Error('expected feasible plan');
  state = mobilityReducer(state, actionCreators.matchPlan(plan.id));
  const trip = state.dispatches.find((candidate) => candidate.planId === plan.id);
  if (!trip) throw new Error('expected dispatch');
  return { state, dispatch: trip, planId: plan.id };
}

describe('dispatch lifecycle', () => {
  it('reserves seats at match time without exceeding capacity', () => {
    const { state, dispatch } = prepareMeenaDispatch();
    const vehicle = state.vehicles.find((candidate) => candidate.id === 'veh-auto-3');
    expect(dispatch.status).toBe('matched');
    expect(dispatch.studentCount).toBe(6);
    expect(dispatch.seatsReserved).toBe(true);
    expect(dispatch.seatsReleased).toBe(false);
    expect(vehicle?.availableSeats).toBe(0);
    expect(vehicle?.availableSeats).toBeGreaterThanOrEqual(0);
  });

  it('rejects approval before guardian consent and rejects invalid transitions', () => {
    const { state, dispatch } = prepareMeenaDispatch();
    const notApproved = mobilityReducer(state, actionCreators.approveDispatch(dispatch.id, state.version));
    expect(notApproved.dispatches[0].status).toBe('matched');
    expect(notApproved).toBe(state);

    const notStarted = mobilityReducer(state, actionCreators.startTrip(dispatch.id));
    expect(notStarted.dispatches[0].status).toBe('matched');
    expect(notStarted).toBe(state);

    const notCompleted = mobilityReducer(state, actionCreators.completeTrip(dispatch.id));
    expect(notCompleted.dispatches[0].status).toBe('matched');
    expect(notCompleted).toBe(state);
  });

  it('rejects a wrong OTP and accepts the generated demo OTP', () => {
    const { state, dispatch } = prepareMeenaDispatch();
    const wrong = mobilityReducer(state, actionCreators.confirmConsent(dispatch.id, '0000'));
    expect(wrong.dispatches[0].status).toBe('matched');
    expect(wrong).toBe(state);

    const consent = mobilityReducer(
      state,
      actionCreators.confirmConsent(dispatch.id, dispatch.consent.otp),
    );
    const consented = consent.dispatches[0];
    expect(consented.status).toBe('guardian_consented');
    expect(consented.consent.status).toBe('confirmed');
    expect(consent.pings.every((ping) => !dispatch.pingIds.includes(ping.id) || ping.status === 'reserved')).toBe(true);
  });

  it('approves once, remains idempotent on duplicate approval, and keeps the seat reservation stable', () => {
    const { state, dispatch } = prepareMeenaDispatch();
    const consented = mobilityReducer(
      state,
      actionCreators.confirmConsent(dispatch.id, dispatch.consent.otp),
    );
    const approved = mobilityReducer(
      consented,
      actionCreators.approveDispatch(dispatch.id, consented.version),
    );
    expect(approved.dispatches[0].status).toBe('approved');
    const seatsAfterFirst = approved.vehicles.find((vehicle) => vehicle.id === 'veh-auto-3')?.availableSeats;

    const approvedAgain = mobilityReducer(
      approved,
      actionCreators.approveDispatch(dispatch.id, approved.version),
    );
    expect(approvedAgain).toBe(approved);
    expect(approvedAgain.dispatches[0].status).toBe('approved');
    expect(approvedAgain.vehicles.find((vehicle) => vehicle.id === 'veh-auto-3')?.availableSeats).toBe(
      seatsAfterFirst,
    );
    expect(approvedAgain.impact.studentsRescued).toBe(0);
  });

  it('rejects stale-version approval and cannot create a second dispatch for the same cluster', () => {
    const { state, dispatch, planId } = prepareMeenaDispatch();
    const consented = mobilityReducer(
      state,
      actionCreators.confirmConsent(dispatch.id, dispatch.consent.otp),
    );
    const staleVersion = consented.version - 1;
    const rejected = mobilityReducer(
      consented,
      actionCreators.approveDispatch(dispatch.id, staleVersion),
    );
    expect(rejected.dispatches[0].status).toBe('guardian_consented');
    expect(rejected).toBe(consented);

    const rematch = mobilityReducer(state, actionCreators.matchPlan(planId));
    expect(rematch).toBe(state);
    expect(rematch.dispatches).toHaveLength(1);
    expect(rematch.vehicles.find((vehicle) => vehicle.id === 'veh-auto-3')?.availableSeats).toBe(0);
  });

  it('completes the trip once and records impact only at completion', () => {
    const { state, dispatch } = prepareMeenaDispatch();
    const consented = mobilityReducer(
      state,
      actionCreators.confirmConsent(dispatch.id, dispatch.consent.otp),
    );
    const approved = mobilityReducer(
      consented,
      actionCreators.approveDispatch(dispatch.id, consented.version),
    );
    expect(approved.impact.studentsRescued).toBe(0);
    const started = mobilityReducer(approved, actionCreators.startTrip(dispatch.id));
    expect(started.dispatches[0].status).toBe('dispatched');
    expect(started.impact.studentsRescued).toBe(0);

    const completed = mobilityReducer(started, actionCreators.completeTrip(dispatch.id));
    expect(completed.dispatches[0].status).toBe('completed');
    expect(completed.impact.studentsRescued).toBe(6);
    expect(completed.impact.tripsCompleted).toBe(1);
    expect(completed.impact.rupeesSaved).toBeGreaterThan(0);
    expect(completed.dispatches[0].impactApplied).toBe(true);
    expect(completed.vehicles.find((vehicle) => vehicle.id === 'veh-auto-3')?.availableSeats).toBe(6);

    const completedAgain = mobilityReducer(completed, actionCreators.completeTrip(dispatch.id));
    expect(completedAgain).toBe(completed);
    expect(completedAgain.impact.studentsRescued).toBe(6);
    expect(completedAgain.impact.tripsCompleted).toBe(1);

    const cancelCompleted = mobilityReducer(
      completed,
      actionCreators.cancelDispatch(dispatch.id, 'should not work'),
    );
    expect(cancelCompleted).toBe(completed);
    expect(cancelCompleted.dispatches[0].status).toBe('completed');
  });

  it('cancellation releases reserved seats exactly once and reopens student pings', () => {
    const { state, dispatch } = prepareMeenaDispatch();
    const consented = mobilityReducer(
      state,
      actionCreators.confirmConsent(dispatch.id, dispatch.consent.otp),
    );
    const approved = mobilityReducer(
      consented,
      actionCreators.approveDispatch(dispatch.id, consented.version),
    );
    expect(approved.vehicles.find((vehicle) => vehicle.id === 'veh-auto-3')?.availableSeats).toBe(0);

    const cancelled = mobilityReducer(
      approved,
      actionCreators.cancelDispatch(dispatch.id, 'Test rollback'),
    );
    expect(cancelled.dispatches[0].status).toBe('cancelled');
    expect(cancelled.dispatches[0].seatsReleased).toBe(true);
    expect(cancelled.vehicles.find((vehicle) => vehicle.id === 'veh-auto-3')?.availableSeats).toBe(6);
    expect(
      cancelled.pings
        .filter((ping) => dispatch.pingIds.includes(ping.id))
        .every((ping) => ping.status === 'waiting'),
    ).toBe(true);
    expect(
      cancelled.decisionLog.some((entry) => entry.kind === 'cancellation'),
    ).toBe(true);

    const seatsAfterCancel = cancelled.vehicles.find((vehicle) => vehicle.id === 'veh-auto-3')?.availableSeats;
    const cancelledAgain = mobilityReducer(
      cancelled,
      actionCreators.cancelDispatch(dispatch.id, 'Second cancel'),
    );
    expect(cancelledAgain).toBe(cancelled);
    expect(cancelledAgain.vehicles.find((vehicle) => vehicle.id === 'veh-auto-3')?.availableSeats).toBe(
      seatsAfterCancel,
    );
    expect(cancelledAgain.dispatches[0].status).toBe('cancelled');
  });

  it('reproduces the guided Meena demo end to end', () => {
    let state = createRuntimeState('normal');
    state = mobilityReducer(state, actionCreators.triggerDisruption('heavy-rain'));
    state = mobilityReducer(state, actionCreators.triggerDisruption('bus-breakdown'));
    state = mobilityReducer(
      state,
      actionCreators.requestPing(
        'adyar',
        'clg-kothur',
        'sms',
        state.studentProfile.alias,
        'Guided demo: Meena texts 1',
      ),
    );
    const cluster = state.clusters.find(
      (candidate) => candidate.villageId === 'adyar' && candidate.destinationCollegeId === 'clg-kothur',
    );
    expect(cluster?.studentCount).toBe(6);
    const plan = state.plans.find(
      (candidate) => candidate.clusterId === cluster?.id && candidate.feasibilityStatus !== 'infeasible',
    );
    expect(plan?.vehicleIds[0]).toBe('veh-auto-3');
    expect(plan?.etaMinutes).toBeGreaterThan(0);

    state = mobilityReducer(state, actionCreators.matchPlan(plan?.id ?? ''));
    const trip = state.dispatches[0];
    expect(trip.status).toBe('matched');
    expect(trip.studentCount).toBe(6);
    state = mobilityReducer(state, actionCreators.confirmConsent(trip.id, trip.consent.otp));
    state = mobilityReducer(state, actionCreators.approveDispatch(trip.id));
    state = mobilityReducer(state, actionCreators.startTrip(trip.id));
    state = mobilityReducer(state, actionCreators.completeTrip(trip.id));

    expect(state.dispatches[0].status).toBe('completed');
    expect(state.impact.studentsRescued).toBe(6);
    expect(state.impact.tripsCompleted).toBe(1);
    expect(state.monsoon).toBe(true);
    expect(state.busRoutes.find((route) => route.id === 'route-a')?.status).toBe('breakdown');
    const kinds = state.decisionLog.map((entry) => entry.kind);
    for (const kind of ['disruption', 'request', 'match', 'consent', 'approval', 'dispatch', 'completion'] as const) {
      expect(kinds).toContain(kind);
    }
  });

  it('records every transition in dispatch history and the decision log', () => {
    const { state, dispatch } = prepareMeenaDispatch();
    let next = mobilityReducer(state, actionCreators.confirmConsent(dispatch.id, dispatch.consent.otp));
    next = mobilityReducer(next, actionCreators.approveDispatch(dispatch.id, next.version));
    next = mobilityReducer(next, actionCreators.startTrip(dispatch.id));
    next = mobilityReducer(next, actionCreators.completeTrip(dispatch.id));
    const trip = next.dispatches[0];
    expect(trip.status).toBe('completed');
    const kinds = trip.history.map((entry) => entry.kind);
    expect(kinds).toContain('match');
    expect(kinds).toContain('consent');
    expect(kinds).toContain('approval');
    expect(kinds).toContain('dispatch');
    expect(kinds).toContain('completion');
    expect(next.decisionLog.some((entry) => entry.kind === 'completion')).toBe(true);
  });
});
