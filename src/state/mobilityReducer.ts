import type {
  AIAllocationPlan,
  CommunityVehicle,
  DecisionLogEntry,
  Dispatch,
  DispatchStatus,
  MobilityState,
  StudentPing,
} from '../types/mobility';
import { createInitialState } from '../data/seedData';
import {
  buildClusters,
  buildReallocationPlans,
  generatePlansForState,
} from '../services/routeOptimizer';
import { createSeededRandom, hashSeed } from '../utils/seededRandom';
import { PING_TTL_MINUTES } from '../utils/simulationClock';
import { canTransition, type MobilityAction } from './actions';

/**
 * The reducer is the single authoritative store. It is pure: all randomness is
 * derived from the seeded state and simulated time, and all engine calls are
 * deterministic pure functions. Seat reservations are validated here, and a
 * dispatch can never double-reserve or double-release capacity.
 */

export const DEMO_TOTAL_STEPS = 12;

export function deriveState(state: MobilityState): MobilityState {
  const clusters = buildClusters(state.pings, state.busRoutes, state.simMinutes);
  const withClusters: MobilityState = { ...state, clusters };
  const plans = generatePlansForState(withClusters);
  const reallocations = buildReallocationPlans(withClusters);
  return { ...withClusters, plans, reallocations };
}

export function createRuntimeState(scenarioId: string): MobilityState {
  return deriveState(createInitialState(scenarioId));
}

export function hydrateState(state: MobilityState): MobilityState {
  return deriveState(state);
}

function newLog(
  state: MobilityState,
  kind: DecisionLogEntry['kind'],
  message: string,
  actor: DecisionLogEntry['actor'] = 'system',
): DecisionLogEntry {
  return {
    id: `log_${state.seed}_${state.decisionLog.length}_${kind}`,
    at: state.simMinutes,
    kind,
    message,
    actor,
  };
}

function withLog(
  state: MobilityState,
  kind: DecisionLogEntry['kind'],
  message: string,
  actor: DecisionLogEntry['actor'] = 'system',
): MobilityState {
  return { ...state, decisionLog: [...state.decisionLog, newLog(state, kind, message, actor)] };
}

function villageName(state: MobilityState, id: string): string {
  return state.stops.find((stop) => stop.id === id)?.name ?? id;
}

function otpFor(seed: number, dispatchId: string): string {
  return String((hashSeed(`${seed}|${dispatchId}|consent`) % 9000) + 1000);
}

function safetyCodeFor(seed: number, dispatchId: string): string {
  return String((hashSeed(`${seed}|${dispatchId}|safety`) % 9000) + 1000);
}

function withDispatchStatus(
  dispatch: Dispatch,
  status: DispatchStatus,
  state: MobilityState,
): Dispatch {
  if (!canTransition(dispatch.status, status)) return dispatch;
  return {
    ...dispatch,
    status,
    updatedAt: state.simMinutes,
    history: [
      ...dispatch.history,
      {
        id: `${dispatch.id}_${status}_${dispatch.history.length}`,
        at: state.simMinutes,
        kind:
          status === 'matched'
            ? 'match'
            : status === 'guardian_consented'
              ? 'consent'
              : status === 'approved'
                ? 'approval'
                : status === 'dispatched'
                  ? 'dispatch'
                  : status === 'completed'
                    ? 'completion'
                    : 'cancellation',
        message: `Dispatch ${dispatch.id} transitioned to ${status}.`,
        actor:
          status === 'guardian_consented'
            ? 'guardian'
            : status === 'approved'
              ? 'coordinator'
              : status === 'dispatched'
                ? 'driver'
                : 'system',
      },
    ],
  };
}

function updateVehicle(
  state: MobilityState,
  vehicleId: string,
  updater: (vehicle: CommunityVehicle) => CommunityVehicle,
): CommunityVehicle[] {
  return state.vehicles.map((vehicle) => (vehicle.id === vehicleId ? updater(vehicle) : vehicle));
}

function completeDispatchInternal(
  state: MobilityState,
  dispatchId: string,
  now: number,
): MobilityState {
  const dispatch = state.dispatches.find((entry) => entry.id === dispatchId);
  if (!dispatch || dispatch.status !== 'dispatched') return state;

  let vehicles = state.vehicles;
  if (dispatch.seatsReserved && !dispatch.seatsReleased) {
    for (const vehicleId of dispatch.vehicleIds) {
      vehicles = vehicles.map((vehicle) =>
        vehicle.id === vehicleId
          ? { ...vehicle, availableSeats: Math.min(vehicle.seats, vehicle.availableSeats + dispatch.studentCount) }
          : vehicle,
      );
    }
  }
  const pings = state.pings.map((ping) =>
    dispatch.pingIds.includes(ping.id) ? { ...ping, status: 'boarded' as const } : ping,
  );
  const completed = withDispatchStatus(dispatch, 'completed', { ...state, simMinutes: now });
  const nextDispatches = state.dispatches.map((entry) =>
    entry.id === dispatchId
      ? {
          ...completed,
          etaRemaining: 0,
          completedAt: now,
          seatsReleased: true,
          impactApplied: true,
        }
      : entry,
  );
  const totalSeats = state.vehicles.reduce((sum, vehicle) => sum + vehicle.seats, 0);
  const tripsCompleted = state.impact.tripsCompleted + 1;
  const studentsRescued = state.impact.studentsRescued + dispatch.studentCount;
  const impact = {
    ...state.impact,
    studentsRescued,
    rupeesSaved: state.impact.rupeesSaved + dispatch.estimatedSavings,
    waitingMinutesSaved:
      state.impact.waitingMinutesSaved +
      Math.max(0, 55 - dispatch.etaMinutes) * dispatch.studentCount,
    tripsCompleted,
    vehicleUtilization:
      totalSeats === 0 ? 0 : Math.min(1, studentsRescued / (totalSeats * tripsCompleted)),
  };
  const withCompletion = withLog(
    {
      ...state,
      simMinutes: now,
      dispatches: nextDispatches,
      vehicles,
      pings,
      impact,
    },
    'completion',
    `Trip ${dispatch.id} completed with ${dispatch.studentCount} students at ${villageName(state, dispatch.villageId)}. ${dispatch.studentCount} rescued, ₹${dispatch.estimatedSavings} estimated savings recorded.`,
  );
  return withCompletion;
}

function releaseReservation(
  dispatch: Dispatch,
  vehicles: CommunityVehicle[],
): CommunityVehicle[] {
  if (!dispatch.seatsReserved || dispatch.seatsReleased) return vehicles;
  return vehicles.map((vehicle) =>
    dispatch.vehicleIds.includes(vehicle.id)
      ? { ...vehicle, availableSeats: Math.min(vehicle.seats, vehicle.availableSeats + dispatch.studentCount) }
      : vehicle,
  );
}

function replenishRouteSchedules(state: MobilityState): MobilityState['busRoutes'] {
  return state.busRoutes.map((route) => {
    if (route.status !== 'running') return route;
    let departure = route.minutesToDeparture - 1;
    let occupancy = route.occupancy;
    if (departure <= 0) {
      departure = route.frequencyMinutes;
      const random = createSeededRandom(`${state.seed}|departure|${route.id}|${state.simMinutes}`);
      occupancy = Math.min(
        route.capacity,
        Math.max(0, route.occupancy + Math.round(random() * 6) - 3),
      );
    }
    return { ...route, minutesToDeparture: departure, occupancy };
  });
}

function tick(state: MobilityState): MobilityState {
  if (!state.clockRunning) return state;
  const now = state.simMinutes + 1;
  const random = createSeededRandom(`${state.seed}|drift|${now}`);
  const lastTickDemand: Record<string, number> = {};
  for (const stop of state.stops) {
    const previous = state.lastTickDemand[stop.id] ?? stop.seededWaiting;
    const drift = Math.round(previous * (random() * 0.2 - 0.1));
    lastTickDemand[stop.id] = Math.max(0, previous + drift);
  }

  const busRoutes = replenishRouteSchedules({ ...state, simMinutes: now });
  const buses = state.buses.map((bus) => {
    if (bus.status !== 'running') return bus;
    const route = busRoutes.find((candidate) => candidate.id === bus.routeId);
    const stopCount = route ? route.stopIds.length : 4;
    let currentStopIndex = bus.currentStopIndex;
    let progress = bus.progress + 0.045;
    if (progress >= 1) {
      currentStopIndex = Math.min(stopCount - 1, currentStopIndex + 1);
      progress = 0;
    }
    return {
      ...bus,
      currentStopIndex,
      progress,
      etaMinutes: Math.max(0, bus.etaMinutes - 1),
    };
  });

  let expiredCount = 0;
  const pings: StudentPing[] = state.pings.map((ping) => {
    if ((ping.status === 'waiting' || ping.status === 'clustered') && ping.expiresAt <= now) {
      expiredCount += 1;
      return { ...ping, status: 'expired' };
    }
    return ping;
  });

  let next: MobilityState = {
    ...state,
    simMinutes: now,
    busRoutes,
    buses,
    pings,
    lastTickDemand,
  };
  if (expiredCount > 0) {
    next = withLog(next, 'simulation', `${expiredCount} stale student ping(s) expired after ${PING_TTL_MINUTES} simulated minutes.`);
  }

  // Advance dispatched trips and auto-complete when the ETA reaches zero.
  for (const dispatch of next.dispatches.filter((entry) => entry.status === 'dispatched')) {
    const remaining = Math.max(0, dispatch.etaRemaining - 1);
    if (remaining <= 0) {
      next = completeDispatchInternal(next, dispatch.id, now);
    } else {
      next = {
        ...next,
        dispatches: next.dispatches.map((entry) =>
          entry.id === dispatch.id ? { ...entry, etaRemaining: remaining, updatedAt: now } : entry,
        ),
      };
    }
  }

  return deriveState(next);
}

function startScenario(state: MobilityState, scenarioId: string): MobilityState {
  const fresh = createRuntimeState(scenarioId);
  return { ...fresh, language: state.language };
}

function triggerDisruption(state: MobilityState, kind: MobilityAction & { type: 'triggerDisruption' }): MobilityState {
  switch (kind.kind) {
    case 'bus-breakdown': {
      const routes = state.busRoutes.map((route) =>
        route.id === 'route-a' ? { ...route, status: 'breakdown' as const } : route,
      );
      const buses = state.buses.map((bus) =>
        bus.routeId === 'route-a' ? { ...bus, status: 'breakdown' as const } : bus,
      );
      return deriveState(
        withLog(
          { ...state, busRoutes: routes, buses },
          'disruption',
          'Route A bus reported a breakdown near Adyar. Route A is unavailable until relief arrives.',
          'driver',
        ),
      );
    }
    case 'exam-surge': {
      return deriveState(
        withLog(
          {
            ...state,
            examDay: true,
            demandMultiplier: Math.max(state.demandMultiplier, 1.35),
          },
          'disruption',
          'Examination-day surge applied: expected demand multiplier is now 1.35.',
        ),
      );
    }
    case 'exam-crisis': {
      return startScenario(state, 'exam-crisis');
    }
    case 'heavy-rain': {
      const edges = state.edges.map((edge) =>
        edge.id === 'rd-melkar-bc-road' ? { ...edge, status: 'flooded' as const } : edge,
      );
      return deriveState(
        withLog(
          { ...state, monsoon: true, edges },
          'disruption',
          'Heavy monsoon rain: Melkar–BC Road is flooded and removed from the active graph; all other roads take 40% longer.',
        ),
      );
    }
    case 'route-cancellation': {
      const routes = state.busRoutes.map((route) =>
        route.id === 'route-b'
          ? { ...route, status: 'cancelled' as const, occupancy: 0 }
          : route,
      );
      const buses = state.buses.map((bus) =>
        bus.routeId === 'route-b' ? { ...bus, status: 'cancelled' as const, occupancy: 0 } : bus,
      );
      return deriveState(
        withLog(
          { ...state, busRoutes: routes, buses },
          'disruption',
          'Route B has been cancelled. Vittla, Farangipete and Mudipu students must be reallocated.',
        ),
      );
    }
  }
}

function reportBusIssue(
  state: MobilityState,
  routeId: string,
  issue: 'full' | 'breakdown',
): MobilityState {
  const route = state.busRoutes.find((candidate) => candidate.id === routeId);
  if (!route) return state;
  const busRoutes = state.busRoutes.map((candidate) =>
    candidate.id === routeId
      ? issue === 'full'
        ? { ...candidate, occupancy: candidate.capacity }
        : { ...candidate, status: 'breakdown' as const }
      : candidate,
  );
  const buses = state.buses.map((bus) =>
    bus.routeId === routeId
      ? issue === 'full'
        ? { ...bus, occupancy: bus.capacity }
        : { ...bus, status: 'breakdown' as const }
      : bus,
  );
  return deriveState(
    withLog(
      { ...state, busRoutes, buses },
      'disruption',
      `Route ${route.code} reported ${issue === 'full' ? 'full at the village stop' : 'a breakdown'}. Students may need a shared alternative.`,
      'coordinator',
    ),
  );
}

function safetyAlert(state: MobilityState, message: string, dispatchId?: string): MobilityState {
  const next = withLog(
    {
      ...state,
      dispatches: dispatchId
        ? state.dispatches.map((dispatch) =>
            dispatch.id === dispatchId
              ? {
                  ...dispatch,
                  history: [
                    ...dispatch.history,
                    {
                      id: `${dispatch.id}_safety_${dispatch.history.length}`,
                      at: state.simMinutes,
                      kind: 'safety' as const,
                      message,
                      actor: 'student' as const,
                    },
                  ],
                }
              : dispatch,
          )
        : state.dispatches,
    },
    'safety',
    `Safety alert: ${message}`,
    'student',
  );
  return next;
}

function requestPing(
  state: MobilityState,
  action: MobilityAction & { type: 'requestPing' },
): MobilityState {
  const alias = action.studentAlias ?? `STU-LIVE-${state.pings.length + 1}`;
  const existing = state.pings.find(
    (ping) =>
      ping.studentAlias === alias &&
      ping.villageId === action.villageId &&
      ping.destinationCollegeId === action.destinationCollegeId &&
      (ping.status === 'waiting' || ping.status === 'clustered' || ping.status === 'matched' || ping.status === 'reserved'),
  );
  if (existing) return state;

  const ping: StudentPing = {
    id: `ping_${state.seed}_${state.pings.length + 1}`,
    studentAlias: alias,
    villageId: action.villageId,
    destinationCollegeId: action.destinationCollegeId,
    createdAt: state.simMinutes,
    expiresAt: state.simMinutes + PING_TTL_MINUTES,
    status: 'waiting',
    isMinor: true,
    consentRequired: true,
    source: action.source,
    ...(action.note ? { note: action.note } : {}),
  };
  const channel = action.source === 'sms' ? 'SMS "1"' : action.source === 'proxy' ? 'coordinator proxy' : 'student app';
  const next = withLog(
    { ...state, pings: [...state.pings, ping] },
    'request',
    `${alias} requested a last-mile match at ${villageName(state, action.villageId)} via ${channel}.`,
    action.source === 'proxy' ? 'coordinator' : 'student',
  );
  return deriveState(next);
}

function matchPlan(state: MobilityState, planId: string): MobilityState {
  const plan = state.plans.find((candidate) => candidate.id === planId);
  if (!plan || plan.feasibilityStatus === 'infeasible') return state;
  const cluster = state.clusters.find((candidate) => candidate.id === plan.clusterId);
  if (!cluster) return state;
  if (state.dispatches.some((dispatch) => dispatch.clusterId === plan.clusterId && dispatch.status !== 'cancelled')) {
    return state;
  }
  for (const vehicleId of plan.vehicleIds) {
    const vehicle = state.vehicles.find((candidate) => candidate.id === vehicleId);
    if (!vehicle || !vehicle.available || vehicle.availableSeats < cluster.studentCount) return state;
  }

  const dispatchId = `dispatch_${state.seed}_${state.dispatches.length + 1}`;
  const now = state.simMinutes;
  const primaryVehicle = state.vehicles.find((candidate) => candidate.id === plan.vehicleIds[0]);
  const requestLog: DecisionLogEntry = {
    id: `${dispatchId}_request`,
    at: now,
    kind: 'request',
    message: `Transport request created for cluster ${cluster.id} (${cluster.studentCount} students).`,
    actor: 'student',
  };
  const matchLog: DecisionLogEntry = {
    id: `${dispatchId}_matched`,
    at: now,
    kind: 'match',
    message: `Cluster of ${cluster.studentCount} at ${villageName(state, cluster.villageId)} matched to ${primaryVehicle?.label ?? plan.vehicleIds[0]}: ${plan.detourKm.toFixed(1)} km detour, ₹${plan.costPerStudent} per student, ${plan.etaMinutes} min ETA, ${plan.verificationTier}.`,
    actor: 'system',
  };

  let dispatch: Dispatch = {
    id: dispatchId,
    planId: plan.id,
    clusterId: cluster.id,
    pingIds: [...cluster.pingIds],
    vehicleIds: [...plan.vehicleIds],
    studentCount: cluster.studentCount,
    destinationCollegeId: plan.destinationCollegeId,
    villageId: plan.villageId,
    status: 'requested',
    createdAt: now,
    updatedAt: now,
    etaMinutes: plan.etaMinutes,
    etaRemaining: plan.etaMinutes,
    costPerStudent: plan.costPerStudent,
    totalCost: plan.totalCost,
    estimatedSavings: Math.max(0, plan.soloFareComparison - plan.costPerStudent) * cluster.studentCount,
    safetyCode: safetyCodeFor(state.seed, dispatchId),
    consent: {
      required: cluster.pingIds.some(
        (id) => state.pings.find((ping) => ping.id === id)?.consentRequired ?? false,
      ),
      status: 'pending',
      otp: otpFor(state.seed, dispatchId),
    },
    seatsReserved: true,
    seatsReleased: false,
    impactApplied: false,
    history: [requestLog],
    ...(plan.routeId ? { routeId: plan.routeId } : {}),
    ...(plan.pickupVillageId ? { pickupVillageId: plan.pickupVillageId } : {}),
    examOutlooks: plan.examOutlooks ?? [],
    studentRanks: plan.studentRanks ?? [],
    unservedStudents: plan.unservedStudents ?? [],
  };
  dispatch = withDispatchStatus(dispatch, 'matched', state);
  dispatch.history = [...dispatch.history, matchLog];

  const vehicles = plan.vehicleIds.reduce(
    (list, vehicleId) =>
      list.map((vehicle) =>
        vehicle.id === vehicleId
          ? { ...vehicle, availableSeats: Math.max(0, vehicle.availableSeats - cluster.studentCount) }
          : vehicle,
      ),
    state.vehicles,
  );
  const pings = state.pings.map((ping) =>
    cluster.pingIds.includes(ping.id) ? { ...ping, status: 'matched' as const } : ping,
  );

  const next = withLog(
    { ...state, vehicles, pings, dispatches: [...state.dispatches, dispatch] },
    'match',
    `Cluster of ${cluster.studentCount} at ${villageName(state, cluster.villageId)} matched to ${primaryVehicle?.label ?? plan.vehicleIds[0]}: ${plan.detourKm.toFixed(1)} km detour, ₹${plan.costPerStudent} per student, ${plan.etaMinutes} min ETA, ${plan.verificationTier}.`,
  );
  return deriveState(next);
}

function confirmConsent(state: MobilityState, dispatchId: string, otp: string): MobilityState {
  const dispatch = state.dispatches.find((entry) => entry.id === dispatchId);
  if (!dispatch || dispatch.status !== 'matched') return state;
  if (!dispatch.consent.required) return state;
  if (otp.trim() !== dispatch.consent.otp) return state;
  const next = withDispatchStatus(
    { ...dispatch, consent: { ...dispatch.consent, status: 'confirmed', confirmedAt: state.simMinutes } },
    'guardian_consented',
    state,
  );
  const withConsentLog = withLog(
    {
      ...state,
      dispatches: state.dispatches.map((entry) => (entry.id === dispatchId ? next : entry)),
      pings: state.pings.map((ping) =>
        dispatch.pingIds.includes(ping.id) ? { ...ping, status: 'reserved' as const } : ping,
      ),
    },
    'consent',
    `Guardian consent confirmed via simulated OTP for ${dispatch.studentCount} students.`,
    'guardian',
  );
  return deriveState(withConsentLog);
}

function approveDispatch(state: MobilityState, dispatchId: string, baseVersion?: number): MobilityState {
  const dispatch = state.dispatches.find((entry) => entry.id === dispatchId);
  if (!dispatch) return state;
  if (dispatch.status === 'approved' || dispatch.status === 'dispatched' || dispatch.status === 'completed') {
    return state;
  }
  if (baseVersion !== undefined && baseVersion !== state.version) return state;
  if (dispatch.status !== 'guardian_consented' && dispatch.status !== 'matched') return state;
  if (dispatch.consent.required && dispatch.consent.status !== 'confirmed') return state;
  if (!dispatch.seatsReserved || dispatch.seatsReleased) return state;

  // Re-validate capacity against the latest known vehicle state.
  for (const vehicleId of dispatch.vehicleIds) {
    const vehicle = state.vehicles.find((candidate) => candidate.id === vehicleId);
    if (
      !vehicle ||
      !vehicle.available ||
      vehicle.availableSeats < 0 ||
      vehicle.availableSeats + dispatch.studentCount > vehicle.seats
    ) {
      return state;
    }
  }
  const pingsIntact = dispatch.pingIds.every((id) => {
    const ping = state.pings.find((candidate) => candidate.id === id);
    return ping && (ping.status === 'matched' || ping.status === 'reserved');
  });
  if (!pingsIntact) return state;

  // Approving a plan is the single point at which route occupancy is adjusted.
  // The exact delta is stored so cancellation can restore the previous value;
  // repeated approval returns early above and changes nothing.
  let busRoutes = state.busRoutes;
  let routeOccupancyApplied = dispatch.routeOccupancyApplied ?? false;
  let routeOccupancyDelta = dispatch.routeOccupancyDelta ?? 0;
  if (dispatch.routeId && !routeOccupancyApplied) {
    const route = state.busRoutes.find((candidate) => candidate.id === dispatch.routeId);
    if (route) {
      const nextOccupancy = Math.min(route.capacity, route.occupancy + dispatch.studentCount);
      routeOccupancyDelta = nextOccupancy - route.occupancy;
      busRoutes = state.busRoutes.map((candidate) =>
        candidate.id === route.id ? { ...candidate, occupancy: nextOccupancy } : candidate,
      );
      routeOccupancyApplied = true;
    }
  }
  const approvedBase: Dispatch = {
    ...dispatch,
    routeOccupancyApplied,
    routeOccupancyDelta,
  };
  const approved = withDispatchStatus(approvedBase, 'approved', state);
  const next = withLog(
    {
      ...state,
      busRoutes,
      dispatches: state.dispatches.map((entry) => (entry.id === dispatchId ? approved : entry)),
      pings: state.pings.map((ping) =>
        dispatch.pingIds.includes(ping.id) ? { ...ping, status: 'reserved' as const } : ping,
      ),
    },
    'approval',
    `Coordinator approved dispatch ${dispatchId}: ${dispatch.studentCount} students, ₹${dispatch.costPerStudent} per student, seats reserved.${dispatch.routeId ? ` Route occupancy updated by ${routeOccupancyDelta}.` : ''}`,
    'coordinator',
  );
  return deriveState(next);
}

function startTrip(state: MobilityState, dispatchId: string): MobilityState {
  const dispatch = state.dispatches.find((entry) => entry.id === dispatchId);
  if (!dispatch || dispatch.status !== 'approved') return state;
  const started = withDispatchStatus(dispatch, 'dispatched', state);
  let vehicles = state.vehicles;
  for (const vehicleId of dispatch.vehicleIds) {
    vehicles = updateVehicle(state, vehicleId, (vehicle) => ({
      ...vehicle,
      // A cut-off village is collected at its nearest reachable alternate stop;
      // do not teleport the vehicle onto the flooded road.
      currentStopId: dispatch.pickupVillageId ?? dispatch.villageId,
    }));
  }
  const next = withLog(
    {
      ...state,
      vehicles,
      dispatches: state.dispatches.map((entry) => (entry.id === dispatchId ? started : entry)),
    },
    'dispatch',
    `Trip ${dispatchId} departed ${villageName(state, dispatch.villageId)} for college. Trip Safety Code ${dispatch.safetyCode}.`,
    'driver',
  );
  return deriveState(next);
}

function completeTrip(state: MobilityState, dispatchId: string): MobilityState {
  const dispatch = state.dispatches.find((entry) => entry.id === dispatchId);
  if (!dispatch || dispatch.status !== 'dispatched') return state;
  return deriveState(completeDispatchInternal(state, dispatchId, state.simMinutes));
}

function cancelDispatch(state: MobilityState, dispatchId: string, reason: string): MobilityState {
  const dispatch = state.dispatches.find((entry) => entry.id === dispatchId);
  if (!dispatch) return state;
  if (dispatch.status === 'completed') return state;
  if (dispatch.status === 'cancelled') return state;

  const vehicles = releaseReservation(dispatch, state.vehicles);
  const busRoutes =
    dispatch.routeOccupancyApplied && dispatch.routeId && (dispatch.routeOccupancyDelta ?? 0) !== 0
      ? state.busRoutes.map((route) =>
          route.id === dispatch.routeId
            ? {
                ...route,
                occupancy: Math.max(
                  0,
                  Math.min(route.capacity, route.occupancy - (dispatch.routeOccupancyDelta ?? 0)),
                ),
              }
            : route,
        )
      : state.busRoutes;
  const pings = state.pings.map((ping) =>
    dispatch.pingIds.includes(ping.id) &&
    (ping.status === 'matched' || ping.status === 'reserved')
      ? { ...ping, status: 'waiting' as const, expiresAt: state.simMinutes + PING_TTL_MINUTES }
      : ping,
  );
  const cancelled: Dispatch = {
    ...dispatch,
    status: 'cancelled',
    updatedAt: state.simMinutes,
    seatsReleased: true,
    cancellationReason: reason,
    history: [
      ...dispatch.history,
      {
        id: `${dispatch.id}_cancelled_${dispatch.history.length}`,
        at: state.simMinutes,
        kind: 'cancellation',
        message: `Dispatch cancelled: ${reason}. Reserved seats released once.`,
        actor: 'coordinator',
      },
    ],
  };
  const next = withLog(
    {
      ...state,
      vehicles,
      busRoutes,
      pings,
      dispatches: state.dispatches.map((entry) => (entry.id === dispatchId ? cancelled : entry)),
    },
    'cancellation',
    `Dispatch ${dispatchId} cancelled: ${reason}. ${dispatch.studentCount} seats released and student pings reopened.`,
    'coordinator',
  );
  return deriveState(next);
}

function setDemo(
  state: MobilityState,
  active: boolean,
  step?: number,
  playing?: boolean,
): MobilityState {
  return {
    ...state,
    demo: {
      active,
      step: step ?? 0,
      totalSteps: DEMO_TOTAL_STEPS,
      playing:
        playing ??
        (active
          ? true
          : false),
    },
  };
}

function baseReducer(state: MobilityState, action: MobilityAction): MobilityState {
  switch (action.type) {
    case 'tick':
      return tick(state);
    case 'setClock':
      return { ...state, clockRunning: action.running };
    case 'setLanguage':
      return { ...state, language: action.language };
    case 'setView':
      return { ...state, view: action.view };
    case 'setScenario':
      return startScenario(state, action.scenarioId);
    case 'reset':
      return createRuntimeState(action.scenarioId ?? state.scenarioId);
    case 'triggerDisruption':
      return triggerDisruption(state, action);
    case 'reportBusIssue':
      return reportBusIssue(state, action.routeId, action.issue);
    case 'safetyAlert':
      return safetyAlert(state, action.message, action.dispatchId);
    case 'requestPing':
      return requestPing(state, action);
    case 'matchPlan':
      return matchPlan(state, action.planId);
    case 'confirmConsent':
      return confirmConsent(state, action.dispatchId, action.otp);
    case 'approveDispatch':
      return approveDispatch(state, action.dispatchId, action.baseVersion);
    case 'startTrip':
      return startTrip(state, action.dispatchId);
    case 'completeTrip':
      return completeTrip(state, action.dispatchId);
    case 'cancelDispatch':
      return cancelDispatch(state, action.dispatchId, action.reason);
    case 'setDemo':
      return setDemo(state, action.active, action.step, action.playing);
    case 'setDemoStep':
      return {
        ...state,
        demo: { ...state.demo, step: action.step, playing: action.playing },
      };
    case 'syncState':
      return action.state;
    default:
      return state;
  }
}

export function mobilityReducer(state: MobilityState, action: MobilityAction): MobilityState {
  if (action.actionId && state.appliedActionIds.includes(action.actionId)) {
    return state;
  }
  const next = baseReducer(state, action);
  if (next === state) return state;
  // A reset or scenario switch intentionally produces a fresh version-1 state.
  if (action.type === 'reset') return next;
  if (action.type === 'setScenario') return next;
  if (action.type === 'syncState') return next;
  const appliedActionIds = action.actionId
    ? [...state.appliedActionIds, action.actionId].slice(-60)
    : state.appliedActionIds;
  return { ...next, version: state.version + 1, appliedActionIds };
}

/** Exposed for tests: plans currently offered for a cluster. */
export function plansForCluster(state: MobilityState, clusterId: string): AIAllocationPlan[] {
  return state.plans.filter((plan) => plan.clusterId === clusterId);
}
