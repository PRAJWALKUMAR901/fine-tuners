import type {
  AIAllocationPlan,
  BusRoute,
  College,
  CommunityVehicle,
  ExamOutlook,
  RoadEdge,
  StudentCluster,
  StudentPing,
  StudentPriority,
  UnservedStudent,
  VillageStop,
} from '../types/mobility';
import { shortestPath } from './graphRouter';
import {
  EXAM_ARRIVAL_BUFFER_MINUTES,
  examSlackMinutes,
  isExamOnTime,
} from './examPolicy';
import { OPTIMIZATION_WEIGHTS, scoreUtilities, VERIFICATION_SCORE } from './weights';
import { formatClock } from '../utils/formatters';

/**
 * Capacity-constrained cluster-level allocation.
 *
 * A cluster is allocated as an intact group. Small seeded datasets use an
 * exhaustive search (exam priority, then coverage, then score); larger datasets
 * fall back to a documented deterministic greedy pass. No vehicle can ever
 * exceed its seats. All exam calculations take `now` from the context so the
 * engine stays pure and deterministic.
 */

export const MAX_DETOUR_KM = 20;
export const DEGRADED_DETOUR_KM = 10;
export const EXHAUSTIVE_CLUSTER_LIMIT = 7;
export const SOLO_AUTO_BASE_FARE = 30;
export const SOLO_AUTO_PER_KM = 14;
const WALKING_MINUTES_PER_KM = 15;
const MAP_UNITS_PER_KM = 40;

export interface AllocationContext {
  now: number;
  monsoon: boolean;
  stops: VillageStop[];
  colleges: College[];
  /** Optional so existing engine callers and tests need not pass routes. */
  routes?: BusRoute[];
}

interface Candidate {
  clusterId: string;
  vehicle: CommunityVehicle;
  detourKm: number;
  tripKm: number;
  etaMinutes: number;
  walkMinutes: number;
  pickupVillageId?: string;
  pickupNote?: string;
  fare: number;
  costPerStudent: number;
  reliability: number;
  seatFit: number;
  verification: number;
  score: number;
  breakdown: AIAllocationPlan['breakdown'];
  feasibilityStatus: 'feasible' | 'degraded';
  examOutlooks: ExamOutlook[];
  onTimeExamCount: number;
  routeId?: string;
  readinessMinutes: number;
  sourceRouteId?: string;
  sourceRouteCode?: string;
  sourceRouteImpact?: string;
}

interface AssignmentResult {
  onTimeExam: number;
  examCovered: number;
  deadlinePoints: number;
  servedStudents: number;
  score: number;
  totalCost: number;
  signature: string;
  assignments: { clusterId: string; vehicleId: string }[];
}

function villageName(context: AllocationContext, id: string): string {
  return context.stops.find((stop) => stop.id === id)?.name ?? id;
}

function collegeName(context: AllocationContext, id: string): string {
  return context.colleges.find((college) => college.id === id)?.shortName ?? id;
}

export function soloAutoFare(distanceKm: number): number {
  return Math.round(SOLO_AUTO_BASE_FARE + distanceKm * SOLO_AUTO_PER_KM);
}

export function isMinorPing(ping: StudentPing): boolean {
  return ping.isMinor;
}

function isDaylightNow(now: number): boolean {
  const minutes = ((now % 1440) + 1440) % 1440;
  return minutes >= 5 * 60 && minutes <= 18 * 60 + 30;
}

export function clusterIsAllMinors(cluster: StudentCluster, pings: StudentPing[]): boolean {
  const members = pings.filter((ping) => cluster.pingIds.includes(ping.id));
  return members.length > 0 && members.every(isMinorPing);
}

function clusterMembers(cluster: StudentCluster, pings: StudentPing[]): StudentPing[] {
  return pings.filter((ping) => cluster.pingIds.includes(ping.id));
}

function earliestExamForCluster(cluster: StudentCluster, pings: StudentPing[]): number {
  const starts = clusterMembers(cluster, pings)
    .map((ping) => ping.examStartMin)
    .filter((value): value is number => value !== undefined);
  return starts.length > 0 ? Math.min(...starts) : Number.POSITIVE_INFINITY;
}

function routeForCluster(context: AllocationContext, cluster: StudentCluster): string | undefined {
  return context.routes?.find(
    (route) =>
      route.destinationCollegeId === cluster.destinationCollegeId &&
      route.stopIds.includes(cluster.villageId),
  )?.id;
}

function routeWaitingFor(context: AllocationContext, pings: StudentPing[], routeId: string): number {
  const route = context.routes?.find((candidate) => candidate.id === routeId);
  if (!route) return 0;
  return pings.filter(
    (ping) =>
      (ping.status === 'waiting' || ping.status === 'clustered') &&
      ping.destinationCollegeId === route.destinationCollegeId &&
      route.stopIds.includes(ping.villageId),
  ).length;
}

function sourceRouteImpact(
  vehicle: CommunityVehicle,
  pings: StudentPing[],
  context: AllocationContext,
): { impact: string; readiness: number } | { error: string } | null {
  if (!vehicle.sourceRouteId) return null;
  const sourceRoute = context.routes?.find((route) => route.id === vehicle.sourceRouteId);
  if (!sourceRoute) return null;
  const waiting = routeWaitingFor(context, pings, sourceRoute.id);
  const seatsBefore =
    sourceRoute.status === 'running'
      ? Math.max(0, sourceRoute.capacity - sourceRoute.occupancy)
      : 0;
  const studentsLeftWithoutSeats = Math.max(0, waiting - seatsBefore);
  if (studentsLeftWithoutSeats > 0) {
    return {
      error: `${vehicle.label} cannot be moved from Route ${sourceRoute.code} without stranding ${studentsLeftWithoutSeats} current student(s) on that route. The source route must be covered first.`,
    };
  }
  const readiness = Math.max(0, vehicle.readinessMinutes ?? 0);
  return {
    readiness,
    impact: `Source-route impact: ${vehicle.label} is the existing Route ${sourceRoute.code} bus. Route ${sourceRoute.code} has ${waiting} waiting student(s) and ${seatsBefore} free seat(s), so its current run is preserved with no student stranded. The bus becomes available after ${readiness} min, then repositions; later Route ${sourceRoute.code} departures lose this ${vehicle.seats}-seat bus and must be reviewed by the coordinator.`,
  };
}

interface PickupPlan {
  pickupVillageId: string;
  walkKm: number;
  walkMinutes: number;
  pickup: NonNullable<ReturnType<typeof shortestPath>>;
  trip: NonNullable<ReturnType<typeof shortestPath>>;
  note?: string;
}

/**
 * Recomputes the trip with closed/flooded edges removed. If the village has no
 * path, the nearest reachable stop that can still reach the college is used as
 * the pickup; walking time is added to the ETA. No invented road is created.
 */
function resolvePickup(
  cluster: StudentCluster,
  vehicle: CommunityVehicle,
  edges: RoadEdge[],
  context: AllocationContext,
): PickupPlan | { error: string } {
  const directPickup = shortestPath(edges, vehicle.currentStopId, cluster.villageId, {
    monsoon: context.monsoon,
  });
  const directTrip = shortestPath(edges, cluster.villageId, cluster.destinationCollegeId, {
    monsoon: context.monsoon,
  });
  if (directPickup && directTrip) {
    return {
      pickupVillageId: cluster.villageId,
      walkKm: 0,
      walkMinutes: 0,
      pickup: directPickup,
      trip: directTrip,
    };
  }

  const origin = context.stops.find((stop) => stop.id === cluster.villageId);
  const options = context.stops
    .filter((stop) => stop.id !== cluster.villageId)
    .map((stop) => {
      const pickup = shortestPath(edges, vehicle.currentStopId, stop.id, {
        monsoon: context.monsoon,
      });
      const trip = shortestPath(edges, stop.id, cluster.destinationCollegeId, {
        monsoon: context.monsoon,
      });
      if (!pickup || !trip) return null;
      const mapKm = origin
        ? Math.hypot(stop.x - origin.x, stop.y - origin.y) / MAP_UNITS_PER_KM
        : 1;
      const walkKm = Math.max(0.4, Math.round(mapKm * 10) / 10);
      return { stop, pickup, trip, walkKm };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.walkKm - b.walkKm || (a.stop.id < b.stop.id ? -1 : 1));

  const best = options[0];
  if (!best) {
    return {
      error: `${villageName(context, cluster.villageId)} has no open road to ${collegeName(context, cluster.destinationCollegeId)}, and no reachable pickup point exists for ${vehicle.label}.`,
    };
  }
  const walkMinutes = Math.ceil(best.walkKm * WALKING_MINUTES_PER_KM);
  return {
    pickupVillageId: best.stop.id,
    walkKm: best.walkKm,
    walkMinutes,
    pickup: best.pickup,
    trip: best.trip,
    note: `Flooding leaves no open road from ${villageName(context, cluster.villageId)} to ${collegeName(context, cluster.destinationCollegeId)}. The nearest reachable pickup is ${best.stop.name}, ${best.walkKm.toFixed(1)} km away; the ETA includes a ${walkMinutes}-minute walk to that point. ${vehicle.label} collects the intact cluster there.`,
  };
}

function examOutlooksFor(
  cluster: StudentCluster,
  pings: StudentPing[],
  etaMinutes: number,
  now: number,
): ExamOutlook[] {
  return clusterMembers(cluster, pings)
    .filter((ping) => ping.examStartMin !== undefined)
    .sort((a, b) => (a.examStartMin ?? 0) - (b.examStartMin ?? 0) || (a.studentAlias < b.studentAlias ? -1 : 1))
    .map((ping) => {
      const examStartMin = ping.examStartMin as number;
      const slack = examSlackMinutes(examStartMin, now, etaMinutes);
      const onTime = isExamOnTime(examStartMin, now, etaMinutes);
      return {
        pingId: ping.id,
        alias: ping.studentAlias,
        examStartMin,
        etaMinutes,
        slackMinutes: slack,
        onTime,
        reason: `${ping.studentAlias}: exam at ${formatClock(examStartMin)} (${Math.max(0, examStartMin - now)} min away). Vehicle ETA ${etaMinutes} min + ${EXAM_ARRIVAL_BUFFER_MINUTES} min buffer gives ${slack >= 0 ? '+' : ''}${slack} min slack — ${onTime ? 'on time' : 'MISSES the deadline'}.`,
      };
    });
}

function buildCandidate(
  cluster: StudentCluster,
  vehicle: CommunityVehicle,
  pings: StudentPing[],
  edges: RoadEdge[],
  context: AllocationContext,
): { candidate: Candidate | null; reason?: string } {
  const students = cluster.studentCount;
  if (!vehicle.available) {
    return { candidate: null, reason: `${vehicle.label} is currently unavailable.` };
  }
  if (vehicle.availableSeats < students) {
    return {
      candidate: null,
      reason: `${vehicle.label} has ${vehicle.availableSeats} free seat(s), fewer than the cluster of ${students}.`,
    };
  }
  if (vehicle.daylightOnly && !isDaylightNow(context.now)) {
    return { candidate: null, reason: `${vehicle.label} is restricted to daylight operations.` };
  }
  if (vehicle.verificationTier === 'Unverified' && students === 1 && clusterIsAllMinors(cluster, pings)) {
    return {
      candidate: null,
      reason: `${vehicle.label} is unverified and cannot carry a lone minor under the safety policy.`,
    };
  }
  const sourceImpact = sourceRouteImpact(vehicle, pings, context);
  if (sourceImpact && 'error' in sourceImpact) {
    return { candidate: null, reason: sourceImpact.error };
  }

  const resolved = resolvePickup(cluster, vehicle, edges, context);
  if ('error' in resolved) {
    return { candidate: null, reason: resolved.error };
  }
  const detourKm = resolved.pickup.distanceKm;
  if (detourKm > MAX_DETOUR_KM) {
    return {
      candidate: null,
      reason: `${vehicle.label} would travel ${detourKm.toFixed(1)} km deadhead, beyond the ${MAX_DETOUR_KM} km detour limit.`,
    };
  }

  const readinessMinutes = sourceImpact?.readiness ?? 0;
  const etaMinutes = Math.max(
    1,
    Math.round(
      resolved.pickup.minutes +
        resolved.trip.minutes +
        resolved.walkMinutes +
        readinessMinutes +
        1,
    ),
  );
  const fare =
    vehicle.baseFare +
    vehicle.farePerKm * (resolved.trip.distanceKm + detourKm * 0.5);
  const costPerStudent = fare / students;
  const examOutlooks = examOutlooksFor(cluster, pings, etaMinutes, context.now);

  return {
    candidate: {
      clusterId: cluster.id,
      vehicle,
      detourKm,
      tripKm: resolved.trip.distanceKm,
      etaMinutes,
      walkMinutes: resolved.walkMinutes,
      ...(resolved.pickupVillageId !== cluster.villageId
        ? { pickupVillageId: resolved.pickupVillageId }
        : {}),
      ...(resolved.note ? { pickupNote: resolved.note } : {}),
      fare,
      costPerStudent,
      reliability: vehicle.driverRating / 5,
      seatFit: Math.max(0.35, 1 - Math.abs(vehicle.seats - students) / vehicle.seats),
      verification: VERIFICATION_SCORE[vehicle.verificationTier],
      score: 0,
      breakdown: { cost: 0, eta: 0, reliability: 0, detour: 0, seatFit: 0, verification: 0 },
      feasibilityStatus: detourKm > DEGRADED_DETOUR_KM ? 'degraded' : 'feasible',
      examOutlooks,
      onTimeExamCount: examOutlooks.filter((outlook) => outlook.onTime).length,
      routeId: routeForCluster(context, cluster),
      readinessMinutes,
      ...(vehicle.sourceRouteId ? { sourceRouteId: vehicle.sourceRouteId } : {}),
      ...(vehicle.sourceRouteId && context.routes?.find((route) => route.id === vehicle.sourceRouteId)
        ? {
            sourceRouteCode: context.routes.find((route) => route.id === vehicle.sourceRouteId)
              ?.code,
          }
        : {}),
      ...(sourceImpact && 'impact' in sourceImpact
        ? { sourceRouteImpact: sourceImpact.impact }
        : {}),
    },
  };
}

function normaliseCandidates(candidates: Candidate[]): void {
  if (candidates.length === 0) return;
  const costs = candidates.map((candidate) => candidate.costPerStudent);
  const etas = candidates.map((candidate) => candidate.etaMinutes);
  const detours = candidates.map((candidate) => candidate.detourKm);
  const min = (values: number[]): number => Math.min(...values);
  const max = (values: number[]): number => Math.max(...values);
  const spread = (values: number[]): number => {
    const range = max(values) - min(values);
    return range === 0 ? 1 : range;
  };

  for (const candidate of candidates) {
    const cost = 1 - (candidate.costPerStudent - min(costs)) / spread(costs);
    const eta = 1 - (candidate.etaMinutes - min(etas)) / spread(etas);
    const detour = 1 - (candidate.detourKm - min(detours)) / spread(detours);
    const breakdown = {
      cost: Math.min(1, Math.max(0, cost)),
      eta: Math.min(1, Math.max(0, eta)),
      reliability: candidate.reliability,
      detour: Math.min(1, Math.max(0, detour)),
      seatFit: candidate.seatFit,
      verification: candidate.verification,
    };
    candidate.breakdown = breakdown;
    candidate.score = scoreUtilities(breakdown, OPTIMIZATION_WEIGHTS);
  }
}

function buildStudentRanks(
  cluster: StudentCluster,
  pings: StudentPing[],
  candidate: Candidate,
): StudentPriority[] {
  const outlookByPing = new Map(candidate.examOutlooks.map((outlook) => [outlook.pingId, outlook]));
  return clusterMembers(cluster, pings)
    .sort((a, b) => {
      const aExam = a.examStartMin !== undefined;
      const bExam = b.examStartMin !== undefined;
      if (aExam !== bExam) return aExam ? -1 : 1;
      if (aExam && bExam) {
        return (a.examStartMin ?? 0) - (b.examStartMin ?? 0) || (a.studentAlias < b.studentAlias ? -1 : 1);
      }
      return a.studentAlias < b.studentAlias ? -1 : 1;
    })
    .map((ping, index) => {
      const outlook = outlookByPing.get(ping.id);
      return {
        pingId: ping.id,
        alias: ping.studentAlias,
        rank: index + 1,
        category: ping.examStartMin !== undefined ? ('exam' as const) : ('general' as const),
        ...(ping.examStartMin !== undefined ? { examStartMin: ping.examStartMin } : {}),
        reason:
          outlook
            ? `Rank #${index + 1}: exam at ${formatClock(outlook.examStartMin)}, earliest deadline first; ${outlook.onTime ? `${outlook.slackMinutes} min slack` : `misses deadline by ${Math.abs(outlook.slackMinutes)} min`}.`
            : `Rank #${index + 1}: no exam today, allocated after exam-priority students.`,
      };
    });
}

function reasonText(
  cluster: StudentCluster,
  candidate: Candidate,
  context: AllocationContext,
  mode: 'standard' | 'degraded',
): string[] {
  const vehicle = candidate.vehicle;
  const solo = soloAutoFare(candidate.tripKm);
  const reasons: string[] = [];
  reasons.push(
    `Cluster of ${cluster.studentCount} students at ${villageName(context, cluster.villageId)} matched to ${vehicle.label} for ${collegeName(context, cluster.destinationCollegeId)}.`,
  );
  reasons.push(
    `The vehicle has ${vehicle.seats} seats and can carry all ${cluster.studentCount} students in one intact group without exceeding capacity.`,
  );
  if (candidate.pickupNote) {
    reasons.push(candidate.pickupNote);
  }
  if (candidate.examOutlooks.length > 0) {
    reasons.push(
      `Exam priority: ${candidate.examOutlooks.length} student(s) in this intact cluster are ranked by exam first, then earliest deadline, before students without exams. ${candidate.onTimeExamCount} of ${candidate.examOutlooks.length} can arrive on time with the 15-minute buffer.`,
    );
    candidate.examOutlooks.forEach((outlook) => reasons.push(outlook.reason));
  }
  reasons.push(
    candidate.detourKm === 0
      ? `${vehicle.label} is already positioned at the pick-up point, so no deadhead detour is added.`
      : `${vehicle.label} travels ${candidate.detourKm.toFixed(1)} km from ${vehicle.currentStopId} to the pick-up, adding ${candidate.detourKm.toFixed(1)} km of deadhead distance.`,
  );
  const servingRoute = context.routes?.find((route) => route.id === candidate.routeId);
  if (servingRoute) {
    reasons.push(
      `Serving route: Route ${servingRoute.code} (${servingRoute.name}). Approval adds this cluster to the route's recorded occupancy so the source-route impact is auditable.`,
    );
  }
  if (candidate.sourceRouteImpact) {
    reasons.push(candidate.sourceRouteImpact);
  }
  reasons.push(
    `Shared fare is ₹${Math.round(candidate.costPerStudent)} per student, compared with ₹${solo} for a solo auto ride of ${candidate.tripKm.toFixed(1)} km.`,
  );
  reasons.push(
    `Estimated travel time is ${candidate.etaMinutes} minutes from dispatch to college arrival${candidate.walkMinutes > 0 ? `, including ${candidate.walkMinutes} minutes walking to the alternate pickup` : ''}${candidate.readinessMinutes > 0 ? `, including ${candidate.readinessMinutes} minutes of source-route readiness before repositioning` : ''}. Driver verification tier: ${vehicle.verificationTier.toLowerCase()}.`,
  );
  if (mode === 'degraded') {
    reasons.push(
      `Feasibility is degraded because the deadhead detour exceeds ${DEGRADED_DETOUR_KM} km; coordinator review is recommended.`,
    );
  }
  if (vehicle.verificationTier === 'Unverified') {
    reasons.push('Safety note: this driver is unverified; the group is larger than one minor, so policy permits a shared allocation.');
  }
  return reasons;
}

function buildPlan(
  cluster: StudentCluster,
  candidate: Candidate,
  context: AllocationContext,
  sharedVehicleStudentCount: number,
  pings: StudentPing[],
): AIAllocationPlan {
  // Shared rides split the trip fare across every student aboard; this never
  // changes seat counts, only cost attribution.
  const sharedCostPerStudent = candidate.fare / Math.max(sharedVehicleStudentCount, cluster.studentCount);
  const totalCost = Math.round(sharedCostPerStudent * cluster.studentCount);
  const costPerStudent = Math.round(sharedCostPerStudent);
  const solo = soloAutoFare(candidate.tripKm);
  const confidence = Math.min(
    0.98,
    Math.max(
      0.5,
      0.55 +
        0.3 * candidate.verification +
        0.1 * (candidate.feasibilityStatus === 'feasible' ? 1 : 0.5) +
        0.03 * (1 - Math.min(1, candidate.detourKm / MAX_DETOUR_KM)),
    ),
  );
  const reasons = reasonText(
    cluster,
    candidate,
    context,
    candidate.feasibilityStatus === 'degraded' ? 'degraded' : 'standard',
  );
  const studentRanks = buildStudentRanks(cluster, pings, candidate);
  if (studentRanks.length > 0) {
    reasons.push(
      `Priority order in this intact cluster: ${studentRanks
        .map((student) => `#${student.rank} ${student.alias}${student.category === 'exam' ? ' (exam)' : ''}`)
        .join(', ')}.`,
    );
  }
  return {
    id: `plan_${cluster.id}_${candidate.vehicle.id}`,
    clusterId: cluster.id,
    villageId: cluster.villageId,
    destinationCollegeId: cluster.destinationCollegeId,
    vehicleIds: [candidate.vehicle.id],
    studentsCovered: cluster.studentCount,
    totalCost,
    costPerStudent,
    soloFareComparison: solo,
    etaMinutes: candidate.etaMinutes,
    detourKm: Math.round(candidate.detourKm * 10) / 10,
    verificationTier: candidate.vehicle.verificationTier,
    confidence: Math.round(confidence * 100) / 100,
    feasibilityStatus: candidate.feasibilityStatus,
    score: Math.round(candidate.score * 1000) / 1000,
    reasoning: reasons,
    breakdown: {
      cost: Math.round(candidate.breakdown.cost * 100) / 100,
      eta: Math.round(candidate.breakdown.eta * 100) / 100,
      reliability: Math.round(candidate.breakdown.reliability * 100) / 100,
      detour: Math.round(candidate.breakdown.detour * 100) / 100,
      seatFit: Math.round(candidate.breakdown.seatFit * 100) / 100,
      verification: Math.round(candidate.breakdown.verification * 100) / 100,
    },
    generatedAt: context.now,
    ...(candidate.pickupVillageId ? { pickupVillageId: candidate.pickupVillageId } : {}),
    ...(candidate.pickupNote ? { pickupNote: candidate.pickupNote } : {}),
    ...(candidate.routeId ? { routeId: candidate.routeId } : {}),
    ...(candidate.sourceRouteId ? { sourceRouteId: candidate.sourceRouteId } : {}),
    ...(candidate.sourceRouteCode ? { sourceRouteCode: candidate.sourceRouteCode } : {}),
    ...(candidate.sourceRouteImpact ? { sourceRouteImpact: candidate.sourceRouteImpact } : {}),
    ...(candidate.readinessMinutes > 0 ? { readinessMinutes: candidate.readinessMinutes } : {}),
    examStudentCount: candidate.examOutlooks.length,
    onTimeExamCount: candidate.onTimeExamCount,
    examOutlooks: candidate.examOutlooks,
    studentRanks,
    unservedStudents: [],
  };
}

function infeasiblePlan(
  cluster: StudentCluster,
  pings: StudentPing[],
  context: AllocationContext,
  reasons: string[],
): AIAllocationPlan {
  const members = clusterMembers(cluster, pings).sort((a, b) => {
    const aExam = a.examStartMin !== undefined;
    const bExam = b.examStartMin !== undefined;
    if (aExam !== bExam) return aExam ? -1 : 1;
    return (a.examStartMin ?? 0) - (b.examStartMin ?? 0) || (a.studentAlias < b.studentAlias ? -1 : 1);
  });
  const reason = reasons[0] ?? 'No feasible vehicle remains after capacity and safety checks.';
  const unservedStudents: UnservedStudent[] = members.map((ping) => ({
    pingId: ping.id,
    alias: ping.studentAlias,
    ...(ping.examStartMin !== undefined ? { examStartMin: ping.examStartMin } : {}),
    reason:
      ping.examStartMin !== undefined
        ? `${ping.studentAlias} cannot be served: exam at ${formatClock(ping.examStartMin)}. ${reason}`
        : `${ping.studentAlias} cannot be served: ${reason}`,
  }));
  return {
    id: `plan_${cluster.id}_unserved`,
    clusterId: cluster.id,
    villageId: cluster.villageId,
    destinationCollegeId: cluster.destinationCollegeId,
    vehicleIds: [],
    studentsCovered: 0,
    totalCost: 0,
    costPerStudent: 0,
    soloFareComparison: 0,
    etaMinutes: 0,
    detourKm: 0,
    verificationTier: 'Unverified',
    confidence: 0,
    feasibilityStatus: 'infeasible',
    score: 0,
    reasoning: [
      `No feasible community vehicle is currently available for the cluster of ${cluster.studentCount} students at ${villageName(context, cluster.villageId)}.`,
      ...reasons,
      ...(members.some((ping) => ping.examStartMin !== undefined)
        ? [
            `Exam students affected: ${members
              .filter((ping) => ping.examStartMin !== undefined)
              .map((ping) => `${ping.studentAlias} (exam ${formatClock(ping.examStartMin as number)})`)
              .join(', ')}.`,
          ]
        : []),
      'Coordinator action required: hold the students at a safe pickup point or request a relief bus.',
    ],
    breakdown: { cost: 0, eta: 0, reliability: 0, detour: 0, seatFit: 0, verification: 0 },
    generatedAt: context.now,
    examStudentCount: members.filter((ping) => ping.examStartMin !== undefined).length,
    onTimeExamCount: 0,
    examOutlooks: [],
    studentRanks: members.map((ping, index) => ({
      pingId: ping.id,
      alias: ping.studentAlias,
      rank: index + 1,
      category: ping.examStartMin !== undefined ? ('exam' as const) : ('general' as const),
      ...(ping.examStartMin !== undefined ? { examStartMin: ping.examStartMin } : {}),
      reason:
        ping.examStartMin !== undefined
          ? `Rank #${index + 1}: exam at ${formatClock(ping.examStartMin)} — unserved because no feasible vehicle exists.`
          : `Rank #${index + 1}: no exam — unserved after exam-priority allocation.`,
    })),
    unservedStudents,
  };
}

/**
 * Allocates intact clusters to vehicles in priority order. Exam clusters rank
 * first, then earliest deadline, then all remaining clusters. The exhaustive
 * objective maximises on-time exam students, exam coverage, deadline urgency,
 * then total students served, weighted score and cost. Capacity is checked at
 * every branch and on the final plan.
 */
export function allocateClusters(
  clusters: StudentCluster[],
  pings: StudentPing[],
  vehicles: CommunityVehicle[],
  edges: RoadEdge[],
  context: AllocationContext,
): AIAllocationPlan[] {
  const open = clusters.filter((cluster) => cluster.status === 'open' && cluster.studentCount > 0);
  if (open.length === 0) return [];

  const candidatesByCluster = new Map<string, Candidate[]>();
  const reasonsByCluster = new Map<string, string[]>();
  const orderedClusters = [...open].sort((a, b) => {
    const aExam = earliestExamForCluster(a, pings);
    const bExam = earliestExamForCluster(b, pings);
    if (aExam !== bExam) return aExam - bExam;
    return a.villageId === b.villageId
      ? a.destinationCollegeId === b.destinationCollegeId
        ? a.id < b.id
          ? -1
          : 1
        : a.destinationCollegeId < b.destinationCollegeId
          ? -1
          : 1
      : a.villageId < b.villageId
        ? -1
        : 1;
  });

  for (const cluster of orderedClusters) {
    const candidates: Candidate[] = [];
    const reasons: string[] = [];
    const orderedVehicles = [...vehicles].sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const vehicle of orderedVehicles) {
      const result = buildCandidate(cluster, vehicle, pings, edges, context);
      if (result.candidate) candidates.push(result.candidate);
      else if (result.reason) reasons.push(result.reason);
    }
    normaliseCandidates(candidates);
    candidates.sort(
      (a, b) =>
        b.onTimeExamCount - a.onTimeExamCount ||
        b.score - a.score ||
        (a.vehicle.id < b.vehicle.id ? -1 : 1),
    );
    candidatesByCluster.set(cluster.id, candidates);
    reasonsByCluster.set(cluster.id, reasons);
  }

  const useGreedy = orderedClusters.length > EXHAUSTIVE_CLUSTER_LIMIT || vehicles.length > 6;
  const assignments: { clusterId: string; vehicleId: string }[] = [];

  if (useGreedy) {
    const remaining = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle.availableSeats]));
    const destinations = new Map<string, string>();
    for (const cluster of orderedClusters) {
      const candidates = candidatesByCluster.get(cluster.id) ?? [];
      const chosen = candidates.find((candidate) => {
        const seats = remaining.get(candidate.vehicle.id) ?? 0;
        const destination = destinations.get(candidate.vehicle.id);
        return seats >= cluster.studentCount && (!destination || destination === cluster.destinationCollegeId);
      });
      if (chosen) {
        assignments.push({ clusterId: cluster.id, vehicleId: chosen.vehicle.id });
        remaining.set(chosen.vehicle.id, (remaining.get(chosen.vehicle.id) ?? 0) - cluster.studentCount);
        destinations.set(chosen.vehicle.id, cluster.destinationCollegeId);
      }
    }
  } else {
    const bestRef: { value: AssignmentResult | null } = { value: null };
    const loads = new Map<string, { students: number; destination: string }>();
    const current: { clusterId: string; vehicleId: string }[] = [];
    const clusterById = new Map(open.map((cluster) => [cluster.id, cluster]));

    const evaluate = (score: number, cost: number): void => {
      const signature = current
        .map((entry) => `${entry.clusterId}>${entry.vehicleId}`)
        .sort()
        .join('|');
      let servedStudents = 0;
      let onTimeExam = 0;
      let examCovered = 0;
      let deadlinePoints = 0;
      for (const entry of current) {
        const cluster = clusterById.get(entry.clusterId);
        if (!cluster) continue;
        servedStudents += cluster.studentCount;
        const candidate = candidatesByCluster
          .get(entry.clusterId)
          ?.find((item) => item.vehicle.id === entry.vehicleId);
        if (!candidate) continue;
        for (const outlook of candidate.examOutlooks) {
          examCovered += 1;
          if (outlook.onTime) {
            onTimeExam += 1;
            deadlinePoints += Math.max(0, 120 - (outlook.examStartMin - context.now));
          }
        }
      }
      const best = bestRef.value;
      const better =
        !best ||
        onTimeExam > best.onTimeExam ||
        (onTimeExam === best.onTimeExam &&
          (examCovered > best.examCovered ||
            (examCovered === best.examCovered &&
              (deadlinePoints > best.deadlinePoints ||
                (deadlinePoints === best.deadlinePoints &&
                  (servedStudents > best.servedStudents ||
                    (servedStudents === best.servedStudents &&
                      (score > best.score + 1e-9 ||
                        (Math.abs(score - best.score) <= 1e-9 &&
                          (cost < best.totalCost - 1e-9 ||
                            (Math.abs(cost - best.totalCost) <= 1e-9 && signature < best.signature)))))))))));
      if (better) {
        bestRef.value = {
          onTimeExam,
          examCovered,
          deadlinePoints,
          servedStudents,
          score,
          totalCost: cost,
          signature,
          assignments: [...current],
        };
      }
    };

    const search = (index: number, score: number, cost: number): void => {
      if (index >= orderedClusters.length) {
        evaluate(score, cost);
        return;
      }
      const cluster = orderedClusters[index];
      const candidates = candidatesByCluster.get(cluster.id) ?? [];
      for (const candidate of candidates) {
        const load = loads.get(candidate.vehicle.id);
        const used = load?.students ?? 0;
        const effectiveCapacity = Math.min(candidate.vehicle.seats, candidate.vehicle.availableSeats);
        if (used + cluster.studentCount > effectiveCapacity) continue;
        if (load && load.destination !== cluster.destinationCollegeId) continue;
        loads.set(candidate.vehicle.id, {
          students: used + cluster.studentCount,
          destination: cluster.destinationCollegeId,
        });
        current.push({ clusterId: cluster.id, vehicleId: candidate.vehicle.id });
        search(index + 1, score + candidate.score, cost + candidate.fare);
        current.pop();
        if (used === 0) loads.delete(candidate.vehicle.id);
        else loads.set(candidate.vehicle.id, load as { students: number; destination: string });
      }
      // Leaving a cluster unserved is always an option; exam and coverage
      // priorities are evaluated at the leaf, not by a fixed greedy order.
      search(index + 1, score, cost);
    };
    search(0, 0, 0);
    if (bestRef.value) assignments.push(...bestRef.value.assignments);
  }

  const vehicleLoads = new Map<string, number>();
  for (const assignment of assignments) {
    const cluster = open.find((entry) => entry.id === assignment.clusterId);
    if (!cluster) continue;
    vehicleLoads.set(
      assignment.vehicleId,
      (vehicleLoads.get(assignment.vehicleId) ?? 0) + cluster.studentCount,
    );
  }

  const plans: AIAllocationPlan[] = [];
  for (const cluster of orderedClusters) {
    const assignment = assignments.find((entry) => entry.clusterId === cluster.id);
    if (assignment) {
      const candidate = candidatesByCluster
        .get(cluster.id)
        ?.find((entry) => entry.vehicle.id === assignment.vehicleId);
      if (candidate) {
        plans.push(
          buildPlan(
            cluster,
            candidate,
            context,
            vehicleLoads.get(assignment.vehicleId) ?? cluster.studentCount,
            pings,
          ),
        );
        continue;
      }
    }
    plans.push(infeasiblePlan(cluster, pings, context, reasonsByCluster.get(cluster.id) ?? []));
  }

  const planExamStart = (plan: AIAllocationPlan): number => {
    const starts = (plan.examOutlooks ?? []).map((outlook) => outlook.examStartMin);
    return starts.length > 0 ? Math.min(...starts) : Number.POSITIVE_INFINITY;
  };

  return plans.sort((a, b) => {
    if (a.feasibilityStatus === 'infeasible' && b.feasibilityStatus !== 'infeasible') return 1;
    if (b.feasibilityStatus === 'infeasible' && a.feasibilityStatus !== 'infeasible') return -1;
    const aExam = planExamStart(a);
    const bExam = planExamStart(b);
    if (aExam !== bExam) return aExam - bExam;
    return b.score - a.score || (a.clusterId < b.clusterId ? -1 : 1);
  });
}
