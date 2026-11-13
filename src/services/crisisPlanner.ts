import type {
  AIAllocationPlan,
  BusReliefMove,
  CrisisAnalysis,
  CrisisComparisonSide,
  Dispatch,
  ExamOutlook,
  ExamStudentStatus,
  MobilityState,
  StudentPing,
  UnservedStudent,
} from '../types/mobility';
import {
  EXAM_ARRIVAL_BUFFER_MINUTES,
  EXAM_URGENT_SLACK_MINUTES,
  examSlackMinutes,
  isExamOnTime,
  minutesUntilExam,
} from './examPolicy';
import { routeAvailableSeats, routeRisk, routeServes } from './routeOptimizer';
import { shortestPath } from './graphRouter';
import { scenarioBaselineRoutes } from '../data/seedData';
import { formatClock } from '../utils/formatters';

/**
 * Exam-day crisis analytics. Pure service: `now` is passed in explicitly and
 * every comparison is recomputed from the current seeded state, not fixed
 * numbers. React never supplies hidden state to these calculations.
 */

interface Coverage {
  etaMinutes: number;
  vehicleLabel?: string;
  examOutlooks: ExamOutlook[];
  plan?: AIAllocationPlan;
  dispatch?: Dispatch;
}

function activePings(state: MobilityState): StudentPing[] {
  return state.pings.filter(
    (ping) => ping.status !== 'expired' && ping.status !== 'cancelled',
  );
}

function coveredPings(state: MobilityState): Map<string, Coverage> {
  const covered = new Map<string, Coverage>();

  for (const plan of state.plans) {
    if (plan.feasibilityStatus === 'infeasible') continue;
    const vehicle = state.vehicles.find((candidate) => candidate.id === plan.vehicleIds[0]);
    const cluster = state.clusters.find((candidate) => candidate.id === plan.clusterId);
    if (!cluster) continue;
    for (const pingId of cluster.pingIds) {
      covered.set(pingId, {
        etaMinutes: plan.etaMinutes,
        vehicleLabel: vehicle?.label,
        examOutlooks: plan.examOutlooks ?? [],
        plan,
      });
    }
  }

  for (const dispatch of state.dispatches) {
    if (dispatch.status === 'cancelled') continue;
    const vehicle = state.vehicles.find((candidate) => candidate.id === dispatch.vehicleIds[0]);
    const eta = dispatch.status === 'dispatched' ? dispatch.etaRemaining : dispatch.etaMinutes;
    for (const pingId of dispatch.pingIds) {
      covered.set(pingId, {
        etaMinutes: eta,
        vehicleLabel: vehicle?.label,
        examOutlooks: dispatch.examOutlooks ?? [],
        dispatch,
      });
    }
  }

  return covered;
}

function reasonForUnserved(
  state: MobilityState,
  ping: StudentPing,
  planReason?: string,
): string {
  const infeasible = state.plans.find(
    (plan) =>
      plan.feasibilityStatus === 'infeasible' &&
      plan.villageId === ping.villageId &&
      plan.destinationCollegeId === ping.destinationCollegeId,
  );
  const base =
    planReason ??
    infeasible?.unservedStudents?.find((entry) => entry.pingId === ping.id)?.reason ??
    infeasible?.reasoning[0] ??
    'No feasible vehicle remains after two bus breakdowns, the seeded demand increase and the flooded road.';
  return ping.examStartMin !== undefined
    ? `${ping.studentAlias} is unserved. Exam at ${formatClock(ping.examStartMin)}. ${base}`
    : `${ping.studentAlias} is unserved. ${base}`;
}

function buildComparisonSide(input: {
  active: StudentPing[];
  coveredIds: Set<string>;
  examOnTime: number;
}): CrisisComparisonSide {
  const examTotal = input.active.filter((ping) => ping.examStartMin !== undefined).length;
  const served = input.active.filter((ping) => input.coveredIds.has(ping.id)).length;
  return {
    examStudentsOnTime: input.examOnTime,
    examStudentsTotal: examTotal,
    totalServed: served,
    studentsUnserved: input.active.length - served,
    totalDemand: input.active.length,
  };
}

/**
 * "No action" is not a fixed number: it is the surviving government service at
 * the seeded starting state, ordered by request time. Using the baseline route
 * snapshot keeps the comparison fair after a coordinator changes real state.
 */
function evaluateNoAction(
  state: MobilityState,
  now: number,
  active: StudentPing[],
): { side: CrisisComparisonSide; coveredIds: Set<string> } {
  const baselineRoutes =
    state.scenarioId === 'exam-crisis'
      ? scenarioBaselineRoutes(state.scenarioId)
      : state.busRoutes;
  const seats = new Map(
    baselineRoutes
      .filter((route) => route.status === 'running')
      .map((route) => [route.id, routeAvailableSeats(route)]),
  );
  let served = 0;
  let examOnTime = 0;
  const coveredIds = new Set<string>();
  const ordered = [...active].sort(
    (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1),
  );

  for (const ping of ordered) {
    const route = baselineRoutes.find(
      (candidate) =>
        candidate.status === 'running' &&
        routeServes(candidate, ping.villageId, ping.destinationCollegeId),
    );
    if (!route) continue;
    const available = seats.get(route.id) ?? 0;
    if (available <= 0) continue;
    const path = shortestPath(state.edges, ping.villageId, ping.destinationCollegeId, {
      monsoon: state.monsoon,
    });
    if (!path) continue;
    seats.set(route.id, available - 1);
    coveredIds.add(ping.id);
    served += 1;
    if (
      ping.examStartMin !== undefined &&
      isExamOnTime(ping.examStartMin, now, route.minutesToDeparture + path.minutes)
    ) {
      examOnTime += 1;
    }
  }

  return {
    side: {
      examStudentsOnTime: examOnTime,
      examStudentsTotal: active.filter((ping) => ping.examStartMin !== undefined).length,
      totalServed: served,
      studentsUnserved: active.length - served,
      totalDemand: active.length,
    },
    coveredIds,
  };
}

function buildBusMoves(state: MobilityState, now: number): BusReliefMove[] {
  const waitingByRoute = new Map<string, number>();
  for (const route of state.busRoutes) {
    const waiting = state.pings.filter(
      (ping) =>
        (ping.status === 'waiting' || ping.status === 'clustered') &&
        routeServes(route, ping.villageId, ping.destinationCollegeId),
    ).length;
    waitingByRoute.set(route.id, waiting);
  }

  const worstHit = state.busRoutes
    .filter((route) => route.status !== 'running')
    .sort(
      (a, b) =>
        (waitingByRoute.get(b.id) ?? 0) - (waitingByRoute.get(a.id) ?? 0) ||
        (a.id < b.id ? -1 : 1),
    );
  const runningRoutes = state.busRoutes
    .filter((route) => route.status === 'running')
    .sort((a, b) => routeRisk(a, state.pings, now) - routeRisk(b, state.pings, now));
  const lowRiskRoutes = runningRoutes.filter(
    (route) => routeRisk(route, state.pings, now) < 0.6,
  );
  // Prefer genuinely low-risk routes, but a surviving bus on the least-risk
  // running route is still the only existing vehicle available in a crisis.
  const spareRoutes = lowRiskRoutes.length > 0 ? lowRiskRoutes : runningRoutes;

  const moves: BusReliefMove[] = [];
  const usedBuses = new Set<string>();
  for (const target of worstHit) {
    const source = spareRoutes.find((route) => route.id !== target.id);
    if (!source) break;
    const bus = state.buses.find(
      (candidate) =>
        candidate.routeId === source.id &&
        candidate.status === 'running' &&
        !usedBuses.has(candidate.id),
    );
    if (!bus) continue;
    usedBuses.add(bus.id);
    const waiting = waitingByRoute.get(target.id) ?? 0;
    const sourceWaiting = waitingByRoute.get(source.id) ?? 0;
    const sourceSeatsBefore = routeAvailableSeats(source);
    const studentsLeftWithoutSeats = Math.max(0, sourceWaiting - sourceSeatsBefore);
    // Never create a new critical shortage: every currently waiting student on
    // the source route must fit before its bus can be borrowed.
    if (studentsLeftWithoutSeats > 0) continue;

    const staged = state.vehicles.find((vehicle) => vehicle.sourceBusId === bus.id);
    const sourceRisk = Math.round(routeRisk(source, state.pings, now) * 100);
    const sourceDescription =
      lowRiskRoutes.length > 0
        ? `low-risk Route ${source.code} (${sourceRisk}% risk)`
        : `the least-risk surviving route, Route ${source.code} (${sourceRisk}% risk)`;
    const sourceStopId =
      source.stopIds[Math.min(source.stopIds.length - 1, bus.currentStopIndex)] ??
      source.stopIds[0];
    const targetStopId = target.stopIds[0];
    const reposition = shortestPath(state.edges, sourceStopId, targetStopId, {
      monsoon: state.monsoon,
    });
    const readinessMinutes = Math.max(0, bus.etaMinutes);
    const repositionMinutes = Math.round(reposition?.minutes ?? 0);
    const sourceImpact = {
      routeId: source.id,
      routeCode: source.code,
      waitingStudents: sourceWaiting,
      availableSeatsBefore: sourceSeatsBefore,
      availableSeatsAfter: Math.max(0, sourceSeatsBefore - bus.capacity),
      riskBefore: Math.round(routeRisk(source, state.pings, now) * 100) / 100,
      // The current run departs before the bus is reassigned, so no waiting
      // student loses a seat in this crisis window.
      riskAfter: 0,
      currentRunPreserved: true,
      studentsLeftWithoutSeats,
      createsCriticalShortage: false,
      note: `Route ${source.code} keeps its current run: ${sourceWaiting} waiting student(s), ${sourceSeatsBefore} free seat(s), ${studentsLeftWithoutSeats} left without a seat. The next Route ${source.code} departure loses this bus.`,
    };
    moves.push({
      busId: bus.id,
      busLabel: bus.label,
      seats: bus.capacity,
      fromRouteId: source.id,
      fromRouteCode: source.code,
      toRouteId: target.id,
      toRouteCode: target.code,
      readinessMinutes,
      repositionMinutes,
      sourceImpact,
      reason: `${bus.label} (${bus.registration}, ${bus.capacity} seats) is on ${sourceDescription}. Reassign it to Route ${target.code}, where the bus is ${target.status} and ${waiting} student(s) are waiting. It finishes its current Route ${source.code} duty in ${readinessMinutes} min and needs about ${repositionMinutes} min to reposition; the plan ETA includes that readiness. Source-route impact: ${sourceWaiting} waiting, ${sourceSeatsBefore} free seats, ${studentsLeftWithoutSeats} left without a seat, risk ${sourceImpact.riskBefore} → ${sourceImpact.riskAfter}. ${staged ? 'Only the existing Route C bus is used; no new vehicle is introduced.' : 'Only buses already in the fleet are used.'}`,
    });
  }
  return moves;
}

export function evaluateExamCrisis(state: MobilityState, now: number): CrisisAnalysis {
  const active = activePings(state);
  const coverage = coveredPings(state);
  const coveredIds = new Set(coverage.keys());
  const examPings = active
    .filter((ping) => ping.examStartMin !== undefined)
    .sort(
      (a, b) =>
        (a.examStartMin ?? 0) - (b.examStartMin ?? 0) ||
        (a.studentAlias < b.studentAlias ? -1 : 1),
    );

  const examStudents: ExamStudentStatus[] = examPings.map((ping) => {
    const entry = coverage.get(ping.id);
    const examStartMin = ping.examStartMin as number;
    const minutesUntil = minutesUntilExam(examStartMin, now);
    if (!entry) {
      return {
        pingId: ping.id,
        alias: ping.studentAlias,
        villageId: ping.villageId,
        destinationCollegeId: ping.destinationCollegeId,
        examStartMin,
        minutesUntilExam: minutesUntil,
        status: 'unassigned',
        reason: reasonForUnserved(state, ping),
      };
    }
    const stored = entry.examOutlooks.find((outlook) => outlook.pingId === ping.id);
    const etaMinutes = entry.etaMinutes;
    const slack = examSlackMinutes(examStartMin, now, etaMinutes);
    const onTime = isExamOnTime(examStartMin, now, etaMinutes);
    const status = !onTime
      ? ('missed' as const)
      : slack < EXAM_URGENT_SLACK_MINUTES
        ? ('at_risk' as const)
        : ('on_time' as const);
    return {
      pingId: ping.id,
      alias: ping.studentAlias,
      villageId: ping.villageId,
      destinationCollegeId: ping.destinationCollegeId,
      examStartMin,
      minutesUntilExam: minutesUntil,
      status,
      etaMinutes,
      slackMinutes: slack,
      ...(entry.vehicleLabel ? { vehicleLabel: entry.vehicleLabel } : {}),
      reason: `${ping.studentAlias}: ${entry.vehicleLabel ?? 'assigned vehicle'} ETA ${etaMinutes} min + ${EXAM_ARRIVAL_BUFFER_MINUTES} min buffer. Exam at ${formatClock(examStartMin)}; ${slack >= 0 ? `slack ${slack} min` : `short by ${Math.abs(slack)} min`}${stored ? ` (${stored.reason})` : ''}.`,
    };
  });

  const examOnTime = examStudents.filter((student) => student.status === 'on_time' || student.status === 'at_risk').length;
  const noAction = evaluateNoAction(state, now, active);

  const unserved: UnservedStudent[] = active
    .filter((ping) => !coveredIds.has(ping.id))
    .sort((a, b) => {
      const aExam = a.examStartMin !== undefined;
      const bExam = b.examStartMin !== undefined;
      if (aExam !== bExam) return aExam ? -1 : 1;
      return (a.examStartMin ?? 0) - (b.examStartMin ?? 0) || (a.studentAlias < b.studentAlias ? -1 : 1);
    })
    .map((ping) => ({
      pingId: ping.id,
      alias: ping.studentAlias,
      ...(ping.examStartMin !== undefined ? { examStartMin: ping.examStartMin } : {}),
      reason: reasonForUnserved(state, ping),
    }));

  const gramRoute = buildComparisonSide({ active, coveredIds, examOnTime });
  const seatSupply = state.vehicles.reduce(
    (sum, vehicle) => sum + (vehicle.available ? vehicle.availableSeats : 0),
    0,
  );

  return {
    active:
      state.scenarioId === 'exam-crisis' ||
      active.some((ping) => ping.examStartMin !== undefined),
    totalDemand: active.length,
    seatSupply,
    seatShortage: Math.max(0, active.length - seatSupply),
    comparison: {
      noAction: noAction.side,
      gramRoute,
    },
    examStudents,
    unserved,
    busMoves: buildBusMoves(state, now),
  };
}
