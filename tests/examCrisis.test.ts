import { describe, expect, it } from 'vitest';
import type {
  CommunityVehicle,
  MobilityState,
  StudentCluster,
  StudentPing,
} from '../src/types/mobility';
import { createRuntimeState, mobilityReducer } from '../src/state/mobilityReducer';
import { actionCreators } from '../src/state/actions';
import { allocateClusters } from '../src/services/allocation';
import {
  crisisBaselineDemand,
  crisisTargetDemand,
  EXAM_DEMAND_LIFT,
} from '../src/data/seedData';
import { evaluateExamCrisis } from '../src/services/crisisPlanner';
import { isExamOnTime } from '../src/services/examPolicy';
import { shortestPath } from '../src/services/graphRouter';

function contextFor(state: MobilityState) {
  return {
    now: state.simMinutes,
    monsoon: state.monsoon,
    stops: state.stops,
    colleges: state.colleges,
    routes: state.busRoutes,
  };
}

function ping(
  state: MobilityState,
  id: string,
  villageId: string,
  examStartMin?: number,
): StudentPing {
  return {
    id,
    studentAlias: `STU-${id}`,
    villageId,
    destinationCollegeId: 'clg-kothur',
    createdAt: state.simMinutes - 2,
    expiresAt: state.simMinutes + 18,
    status: 'waiting',
    isMinor: true,
    consentRequired: true,
    source: 'app',
    ...(examStartMin !== undefined ? { examStartMin } : {}),
  };
}

function cluster(
  state: MobilityState,
  id: string,
  villageId: string,
  pingIds: string[],
): StudentCluster {
  return {
    id,
    villageId,
    destinationCollegeId: 'clg-kothur',
    pingIds,
    studentCount: pingIds.length,
    windowStart: state.simMinutes - 10,
    windowEnd: state.simMinutes,
    allowSplitting: false,
    status: 'open',
  };
}

describe('exam-day crisis engine', () => {
  it('ranks exam students before everyone else, then by earliest deadline', () => {
    const state = createRuntimeState('normal');
    const now = state.simMinutes;
    const carpool = state.vehicles.find((vehicle) => vehicle.id === 'veh-carpool-2');
    expect(carpool).toBeDefined();
    const vehicle: CommunityVehicle = { ...(carpool as CommunityVehicle), availableSeats: 4 };
    const examPings = [0, 1, 2, 3].map((index) =>
      ping(state, `exam-${index}`, 'adyar', now + 90 + index),
    );
    const generalPings = [0, 1, 2, 3].map((index) =>
      ping(state, `general-${index}`, 'vittla'),
    );
    const examCluster = cluster(state, 'cluster_exam', 'adyar', examPings.map((p) => p.id));
    const generalCluster = cluster(state, 'cluster_general', 'vittla', generalPings.map((p) => p.id));
    const plans = allocateClusters(
      [generalCluster, examCluster],
      [...generalPings, ...examPings],
      [vehicle],
      state.edges,
      contextFor(state),
    );

    const examPlan = plans.find((plan) => plan.clusterId === examCluster.id);
    const generalPlan = plans.find((plan) => plan.clusterId === generalCluster.id);
    expect(examPlan?.feasibilityStatus).not.toBe('infeasible');
    expect(examPlan?.examStudentCount).toBe(4);
    expect(examPlan?.onTimeExamCount).toBe(4);
    expect(generalPlan?.feasibilityStatus).toBe('infeasible');
    expect(generalPlan?.studentsCovered).toBe(0);

    // Inside a mixed intact cluster, exam students are listed first, earliest deadline first.
    const mixedExamEarly = ping(state, 'mixed-exam-early', 'adyar', now + 45);
    const mixedExamLate = ping(state, 'mixed-exam-late', 'adyar', now + 100);
    const mixedGeneral = [ping(state, 'mixed-general-1', 'adyar'), ping(state, 'mixed-general-2', 'adyar')];
    const mixedCluster = cluster(
      state,
      'cluster_mixed',
      'adyar',
      [mixedGeneral[0].id, mixedExamLate.id, mixedGeneral[1].id, mixedExamEarly.id],
    );
    const mixedPlans = allocateClusters(
      [mixedCluster],
      [mixedExamLate, ...mixedGeneral, mixedExamEarly],
      [{ ...vehicle, availableSeats: 4, seats: 4 }],
      state.edges,
      contextFor(state),
    );
    const ranks = mixedPlans[0].studentRanks ?? [];
    expect(ranks.map((rank) => rank.category)).toEqual(['exam', 'exam', 'general', 'general']);
    expect(ranks[0].examStartMin).toBe(now + 45);
    expect(ranks[1].examStartMin).toBe(now + 100);
  });

  it('never counts an exam student on time when ETA plus 15 minutes exceeds the deadline', () => {
    const state = createRuntimeState('normal');
    const now = state.simMinutes;
    const auto = state.vehicles.find((vehicle) => vehicle.id === 'veh-auto-3');
    expect(auto).toBeDefined();
    const pings = [ping(state, 'timing-probe', 'adyar', now + 200)];
    const testCluster = cluster(state, 'cluster_timing_probe', 'adyar', [pings[0].id]);
    const basePlans = allocateClusters(
      [testCluster],
      pings,
      [auto as CommunityVehicle],
      state.edges,
      contextFor(state),
    );
    const eta = basePlans[0].etaMinutes;
    expect(eta).toBeGreaterThan(0);

    expect(isExamOnTime(now + eta + 15, now, eta)).toBe(true);
    expect(isExamOnTime(now + eta + 14, now, eta)).toBe(false);

    const tightPing = ping(state, 'tight-deadline', 'adyar', now + eta + 14);
    const tightCluster = cluster(state, 'cluster_tight', 'adyar', [tightPing.id]);
    const tightPlan = allocateClusters(
      [tightCluster],
      [tightPing],
      [auto as CommunityVehicle],
      state.edges,
      contextFor(state),
    )[0];
    expect(tightPlan.feasibilityStatus).not.toBe('infeasible');
    expect(tightPlan.onTimeExamCount).toBe(0);
    expect(tightPlan.examOutlooks?.[0].onTime).toBe(false);
    expect(tightPlan.examOutlooks?.[0].slackMinutes).toBe(-1);
  });

  it('recomputes routes with flooded edges removed and uses the nearest reachable pickup', () => {
    const state = createRuntimeState('exam-crisis');
    const closed = state.edges.filter((edge) => edge.status !== 'open');
    expect(closed.map((edge) => edge.id)).toEqual(['rd-kalladka-melkar']);
    const closedIds = new Set(closed.map((edge) => edge.id));

    for (const plan of state.plans) {
      if (plan.feasibilityStatus === 'infeasible') continue;
      const vehicle = state.vehicles.find((candidate) => candidate.id === plan.vehicleIds[0]);
      expect(vehicle).toBeDefined();
      const pickup = plan.pickupVillageId ?? plan.villageId;
      const toPickup = shortestPath(state.edges, vehicle?.currentStopId ?? '', pickup, {
        monsoon: state.monsoon,
      });
      const toCollege = shortestPath(state.edges, pickup, plan.destinationCollegeId, {
        monsoon: state.monsoon,
      });
      expect(toPickup).not.toBeNull();
      expect(toCollege).not.toBeNull();
      for (const edgeId of [...(toPickup?.edgeIds ?? []), ...(toCollege?.edgeIds ?? [])]) {
        expect(closedIds.has(edgeId)).toBe(false);
      }
    }

    const kalladkaPlans = state.plans.filter(
      (plan) => plan.villageId === 'kalladka' && plan.feasibilityStatus !== 'infeasible',
    );
    expect(kalladkaPlans.length).toBeGreaterThan(0);
    for (const plan of kalladkaPlans) {
      expect(plan.pickupVillageId).toBe('melkar');
      expect(plan.reasoning.join(' ')).toMatch(/nearest reachable pickup|no open road/i);
    }
  });

  it('never plans or dispatches more students than a vehicle can hold', () => {
    let state = createRuntimeState('exam-crisis');
    const loads = new Map<string, number>();
    for (const plan of state.plans) {
      if (plan.feasibilityStatus === 'infeasible') continue;
      expect(plan.vehicleIds).toHaveLength(1);
      loads.set(
        plan.vehicleIds[0],
        (loads.get(plan.vehicleIds[0]) ?? 0) + plan.studentsCovered,
      );
    }
    for (const [vehicleId, load] of loads) {
      const vehicle = state.vehicles.find((candidate) => candidate.id === vehicleId);
      expect(vehicle).toBeDefined();
      expect(load).toBeLessThanOrEqual(vehicle?.availableSeats ?? 0);
      expect(load).toBeLessThanOrEqual(vehicle?.seats ?? 0);
    }

    const plan = state.plans.find(
      (candidate) =>
        candidate.feasibilityStatus !== 'infeasible' && candidate.routeId !== undefined,
    );
    expect(plan).toBeDefined();
    const vehicleId = (plan as (typeof state.plans)[number]).vehicleIds[0];
    const expectedLoad = (plan as (typeof state.plans)[number]).studentsCovered;
    state = mobilityReducer(state, actionCreators.matchPlan((plan as (typeof state.plans)[number]).id));
    expect(state.vehicles.find((vehicle) => vehicle.id === vehicleId)?.availableSeats).toBe(
      ((state.vehicles.find((vehicle) => vehicle.id === vehicleId)?.seats ?? 0) - expectedLoad),
    );
    expect(state.dispatches[0].studentCount).toBe(expectedLoad);
  });

  it('reproduces the same crisis result from the same seed every run', () => {
    const first = createRuntimeState('exam-crisis');
    const second = createRuntimeState('exam-crisis');
    expect(second).toEqual(first);
    expect(evaluateExamCrisis(second, second.simMinutes)).toEqual(
      evaluateExamCrisis(first, first.simMinutes),
    );

    const baseline = crisisBaselineDemand(first.seed);
    const target = crisisTargetDemand(first.seed);
    expect(baseline % 5).toBe(0);
    expect(target).toBe(Math.round(baseline * (1 + EXAM_DEMAND_LIFT)));
    expect(target - baseline).toBe(Math.round(baseline * EXAM_DEMAND_LIFT));
    expect(first.pings).toHaveLength(target);
    expect(first.pings.length).toBeGreaterThan(baseline);
    const seats = first.vehicles.reduce((sum, vehicle) => sum + vehicle.seats, 0);
    expect(seats).toBeLessThan(first.pings.length);
    expect(first.busRoutes.filter((route) => route.status === 'breakdown')).toHaveLength(2);
    const exam = first.pings.filter((item) => item.examStartMin !== undefined);
    expect(exam.length).toBeGreaterThanOrEqual(5);
    for (const item of exam) {
      const minutes = (item.examStartMin as number) - first.simMinutes;
      expect(minutes).toBeGreaterThanOrEqual(30);
      expect(minutes).toBeLessThanOrEqual(120);
    }
  });

  it('approval changes seats, route occupancy, ping status and the log; repeat approval is a no-op', () => {
    let state = createRuntimeState('exam-crisis');
    const plan = state.plans.find(
      (candidate) =>
        candidate.feasibilityStatus !== 'infeasible' &&
        candidate.routeId !== undefined &&
        candidate.pickupVillageId === undefined,
    );
    expect(plan).toBeDefined();
    if (!plan) return;
    const vehicleId = plan.vehicleIds[0];
    const routeId = plan.routeId as string;
    const originalSeats = state.vehicles.find((vehicle) => vehicle.id === vehicleId)?.availableSeats;
    const originalOccupancy = state.busRoutes.find((route) => route.id === routeId)?.occupancy;

    state = mobilityReducer(state, actionCreators.matchPlan(plan.id));
    const trip = state.dispatches[0];
    expect(trip.status).toBe('matched');
    expect(state.vehicles.find((vehicle) => vehicle.id === vehicleId)?.availableSeats).toBe(
      (originalSeats ?? 0) - plan.studentsCovered,
    );

    state = mobilityReducer(state, actionCreators.confirmConsent(trip.id, trip.consent.otp));
    const approved = mobilityReducer(state, actionCreators.approveDispatch(trip.id));
    expect(approved.dispatches[0].status).toBe('approved');
    expect(approved.busRoutes.find((route) => route.id === routeId)?.occupancy).not.toBe(
      originalOccupancy,
    );
    expect(
      approved.pings
        .filter((item) => trip.pingIds.includes(item.id))
        .every((item) => item.status === 'reserved'),
    ).toBe(true);
    expect(approved.decisionLog.some((entry) => entry.kind === 'approval')).toBe(true);
    const occupancyAfter = approved.busRoutes.find((route) => route.id === routeId)?.occupancy;

    const approvedAgain = mobilityReducer(approved, actionCreators.approveDispatch(trip.id));
    expect(approvedAgain).toBe(approved);
    expect(approvedAgain.busRoutes.find((route) => route.id === routeId)?.occupancy).toBe(
      occupancyAfter,
    );
    expect(approvedAgain.decisionLog.filter((entry) => entry.kind === 'approval')).toHaveLength(1);
  });

  it('applies the exact seeded 40% lift only once, even when the crisis is triggered repeatedly', () => {
    const state = createRuntimeState('exam-crisis');
    const baseline = crisisBaselineDemand(state.seed);
    const target = crisisTargetDemand(state.seed);
    expect(state.pings).toHaveLength(target);
    expect(target).toBe(baseline + baseline * EXAM_DEMAND_LIFT);
    const examCount = state.pings.filter((ping) => ping.examStartMin !== undefined).length;

    let next = mobilityReducer(state, actionCreators.triggerDisruption('exam-crisis'));
    next = mobilityReducer(next, actionCreators.triggerDisruption('exam-crisis'));
    expect(next.pings).toHaveLength(target);
    expect(next.pings.filter((ping) => ping.examStartMin !== undefined)).toHaveLength(examCount);
    expect(next.demandMultiplier).toBe(1.4);

    const scenarioAgain = mobilityReducer(next, actionCreators.setScenario('exam-crisis'));
    expect(scenarioAgain.pings).toHaveLength(target);
  });

  it('keeps the no-action comparison on the seeded baseline after real state changes', () => {
    let state = createRuntimeState('exam-crisis');
    const before = evaluateExamCrisis(state, state.simMinutes).comparison;
    const plan = state.plans.find(
      (candidate) => candidate.feasibilityStatus !== 'infeasible' && candidate.routeId !== undefined,
    );
    expect(plan).toBeDefined();
    if (!plan) return;

    state = mobilityReducer(state, actionCreators.matchPlan(plan.id));
    const trip = state.dispatches[0];
    state = mobilityReducer(state, actionCreators.confirmConsent(trip.id, trip.consent.otp));
    state = mobilityReducer(state, actionCreators.approveDispatch(trip.id, state.version));
    const after = evaluateExamCrisis(state, state.simMinutes).comparison;

    expect(after.noAction).toEqual(before.noAction);
    expect(after.noAction.totalDemand).toBe(state.pings.filter(
      (ping) => ping.status !== 'expired' && ping.status !== 'cancelled',
    ).length);
    expect(after.gramRoute.examStudentsTotal).toBe(after.noAction.examStudentsTotal);
  });

  it('moves only a bus whose source route keeps every current passenger, and never teleports it', () => {
    const state = createRuntimeState('exam-crisis');
    const analysis = evaluateExamCrisis(state, state.simMinutes);
    expect(analysis.busMoves.length).toBeGreaterThan(0);

    for (const move of analysis.busMoves) {
      const bus = state.buses.find((candidate) => candidate.id === move.busId);
      const source = state.busRoutes.find((route) => route.id === move.fromRouteId);
      const relief = state.vehicles.find((vehicle) => vehicle.sourceBusId === move.busId);
      expect(bus).toBeDefined();
      expect(source).toBeDefined();
      expect(relief).toBeDefined();
      if (!bus || !source || !relief) continue;

      const sourceStopId = source.stopIds[bus.currentStopIndex];
      expect(relief.currentStopId).toBe(sourceStopId);
      expect(relief.readinessMinutes).toBe(move.readinessMinutes);
      expect(move.readinessMinutes).toBe(bus.etaMinutes);
      expect(move.repositionMinutes).toBeGreaterThanOrEqual(0);
      expect(move.sourceImpact.studentsLeftWithoutSeats).toBe(0);
      expect(move.sourceImpact.createsCriticalShortage).toBe(false);
      expect(move.sourceImpact.riskAfter).toBeLessThan(1);
      expect(move.sourceImpact.availableSeatsBefore).toBeGreaterThanOrEqual(
        move.sourceImpact.waitingStudents,
      );
      expect(move.reason).toMatch(/reposition|readiness/i);
    }

    const reliefPlans = state.plans.filter(
      (plan) => plan.vehicleIds[0] === 'veh-relief-bus-c' && plan.feasibilityStatus !== 'infeasible',
    );
    expect(reliefPlans.length).toBeGreaterThan(0);
    for (const plan of reliefPlans) {
      expect(plan.readinessMinutes).toBe(16);
      expect(plan.etaMinutes).toBeGreaterThanOrEqual(16);
      expect(plan.reasoning.join(' ')).toMatch(/source-route impact|Route C/i);
    }
  });

  it('uses the alternate pickup when a trip starts, not the flooded village', () => {
    let state = createRuntimeState('exam-crisis');
    const plan = state.plans.find(
      (candidate) =>
        candidate.feasibilityStatus !== 'infeasible' &&
        candidate.pickupVillageId === 'melkar' &&
        candidate.villageId === 'kalladka',
    );
    expect(plan).toBeDefined();
    if (!plan) return;

    state = mobilityReducer(state, actionCreators.matchPlan(plan.id));
    const trip = state.dispatches[0];
    state = mobilityReducer(state, actionCreators.confirmConsent(trip.id, trip.consent.otp));
    state = mobilityReducer(state, actionCreators.approveDispatch(trip.id, state.version));
    const started = mobilityReducer(state, actionCreators.startTrip(trip.id));
    expect(started.dispatches[0].status).toBe('dispatched');
    const vehicle = started.vehicles.find((candidate) => candidate.id === plan.vehicleIds[0]);
    expect(vehicle?.currentStopId).toBe('melkar');
    expect(vehicle?.currentStopId).not.toBe('kalladka');
  });

  it('explains an unreachable village and an impossible exam deadline without inventing success', () => {
    const state = createRuntimeState('normal');
    const now = state.simMinutes;
    const auto = state.vehicles.find((vehicle) => vehicle.id === 'veh-auto-3') as CommunityVehicle;

    const latePing = ping(state, 'impossible-exam', 'adyar', now + 1);
    const lateCluster = cluster(state, 'cluster_impossible', 'adyar', [latePing.id]);
    const latePlan = allocateClusters(
      [lateCluster],
      [latePing],
      [auto],
      state.edges,
      contextFor(state),
    )[0];
    expect(latePlan.feasibilityStatus).not.toBe('infeasible');
    expect(latePlan.examStudentCount).toBe(1);
    expect(latePlan.onTimeExamCount).toBe(0);
    expect(latePlan.examOutlooks?.[0].onTime).toBe(false);
    expect(latePlan.examOutlooks?.[0].reason).toMatch(/MISSES the deadline/i);

    const unreachablePing = ping(state, 'unreachable-village', 'kalladka', now + 60);
    const unreachableCluster = cluster(state, 'cluster_unreachable', 'kalladka', [
      unreachablePing.id,
    ]);
    const unreachablePlan = allocateClusters(
      [unreachableCluster],
      [unreachablePing],
      [auto],
      [],
      contextFor(state),
    )[0];
    expect(unreachablePlan.feasibilityStatus).toBe('infeasible');
    expect(unreachablePlan.studentsCovered).toBe(0);
    expect(unreachablePlan.reasoning.join(' ')).toMatch(/no open road|no reachable pickup/i);
    expect(unreachablePlan.unservedStudents?.[0].reason).toMatch(/cannot be served/i);
  });

  it('keeps production clusters intact and never silently splits a flagged cluster', () => {
    const state = createRuntimeState('exam-crisis');
    expect(state.clusters.length).toBeGreaterThan(0);
    for (const item of state.clusters) {
      expect(item.allowSplitting).toBe(false);
    }
    for (const plan of state.plans) {
      if (plan.feasibilityStatus === 'infeasible') continue;
      const item = state.clusters.find((candidate) => candidate.id === plan.clusterId);
      expect(plan.vehicleIds).toHaveLength(1);
      expect(plan.studentsCovered).toBe(item?.studentCount ?? plan.studentsCovered);
    }

    const splitFlagged = {
      ...cluster(state, 'cluster_split_flag', 'adyar', []),
      studentCount: 6,
      allowSplitting: true,
    };
    const vehicles = state.vehicles
      .filter((vehicle) => vehicle.id === 'veh-carpool-2' || vehicle.id === 'veh-auto-7')
      .map((vehicle) => ({ ...vehicle, seats: 4, availableSeats: 4 }));
    const plans = allocateClusters([splitFlagged], [], vehicles, state.edges, contextFor(state));
    expect(plans).toHaveLength(1);
    expect(plans.every((plan) => plan.vehicleIds.length <= 1)).toBe(true);
    expect(plans[0].feasibilityStatus).toBe('infeasible');
    expect(plans[0].reasoning.join(' ')).toMatch(/seat/i);
  });

  it('cancels without double-releasing and resets the crisis to the same seeded state', () => {
    let state = createRuntimeState('exam-crisis');
    const plan = state.plans.find(
      (candidate) =>
        candidate.feasibilityStatus !== 'infeasible' &&
        candidate.routeId !== undefined &&
        candidate.pickupVillageId === undefined,
    );
    expect(plan).toBeDefined();
    if (!plan) return;
    const vehicleId = plan.vehicleIds[0];
    const routeId = plan.routeId as string;
    const seatsBefore = state.vehicles.find((vehicle) => vehicle.id === vehicleId)?.availableSeats;
    const occupancyBefore = state.busRoutes.find((route) => route.id === routeId)?.occupancy;

    state = mobilityReducer(state, actionCreators.matchPlan(plan.id));
    const trip = state.dispatches[0];
    state = mobilityReducer(state, actionCreators.confirmConsent(trip.id, trip.consent.otp));
    state = mobilityReducer(state, actionCreators.approveDispatch(trip.id, state.version));
    const cancelled = mobilityReducer(state, actionCreators.cancelDispatch(trip.id, 'Crisis test rollback'));

    expect(cancelled.dispatches[0].status).toBe('cancelled');
    expect(cancelled.vehicles.find((vehicle) => vehicle.id === vehicleId)?.availableSeats).toBe(
      seatsBefore,
    );
    expect(cancelled.busRoutes.find((route) => route.id === routeId)?.occupancy).toBe(
      occupancyBefore,
    );
    expect(
      cancelled.pings
        .filter((item) => trip.pingIds.includes(item.id))
        .every((item) => item.status === 'waiting'),
    ).toBe(true);

    const cancelledAgain = mobilityReducer(
      cancelled,
      actionCreators.cancelDispatch(trip.id, 'Second cancel'),
    );
    expect(cancelledAgain).toBe(cancelled);

    const reset = mobilityReducer(cancelled, actionCreators.reset('exam-crisis'));
    expect(reset).toEqual(createRuntimeState('exam-crisis'));
  });
});
