import type {
  AIAllocationPlan,
  BusRoute,
  MobilityState,
  RouteReallocationPlan,
  StudentCluster,
  StudentPing,
  WhatIfProposal,
  WhatIfResult,
} from '../types/mobility';
import { allocateClusters } from './allocation';
import { shortestPath } from './graphRouter';

/**
 * Route optimization orchestration: overcrowding risk, demand clustering,
 * cluster-level allocation and network reallocation what-ifs.
 *
 * Everything in this file is pure and deterministic. `now` is always explicit;
 * no React, DOM, timers or browser APIs are imported.
 */

export const CLUSTER_MIN_STUDENTS = 3;
export const CLUSTER_WINDOW = 10;
export const PING_TTL = 20;
export const STANDARD_RELIEF_BUS_SEATS = 48;

export interface RiskInput {
  /** Additional expected demand, not yet waiting. */
  demand: number;
  /** Students already waiting. */
  waiting: number;
  /** Seats still available on the departing vehicle. */
  availableSeats: number;
  /** Simulated minutes until departure. */
  minutesToDeparture: number;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Monotonic overcrowding risk.
 *
 * R = (D + W) / S, clamped to 1, multiplied by a departure-urgency factor that
 * only grows as departure approaches. No division by zero is possible.
 */
export function computeOvercrowdingRisk(input: RiskInput): number {
  const demand = Math.max(0, input.demand);
  const waiting = Math.max(0, input.waiting);
  const seats = Math.max(0, input.availableSeats);
  const totalDemand = demand + waiting;
  if (totalDemand <= 0) return 0;
  if (seats <= 0) return 1;
  const base = clamp01(totalDemand / seats);
  const departure = Math.max(0, input.minutesToDeparture);
  const urgency = 1 + 0.3 * (1 - clamp01(departure / 60));
  return clamp01(base * urgency);
}

export function riskBandOf(risk: number): 'low' | 'medium' | 'high' | 'critical' {
  if (risk >= 1) return 'critical';
  if (risk > 0.85) return 'high';
  if (risk >= 0.6) return 'medium';
  return 'low';
}

export function isRouteFullOrUnavailable(route: BusRoute): boolean {
  return route.status !== 'running' || route.occupancy >= route.capacity;
}

export function routeServes(route: BusRoute, villageId: string, destinationCollegeId: string): boolean {
  return (
    route.destinationCollegeId === destinationCollegeId && route.stopIds.includes(villageId)
  );
}

export function activeWaitingPings(pings: StudentPing[], now: number): StudentPing[] {
  const windowStart = now - CLUSTER_WINDOW;
  return pings.filter(
    (ping) =>
      (ping.status === 'waiting' || ping.status === 'clustered') &&
      ping.expiresAt > now &&
      ping.createdAt >= windowStart,
  );
}

function routeForPings(
  villageId: string,
  destinationCollegeId: string,
  routes: BusRoute[],
): BusRoute | undefined {
  return routes.find((route) => routeServes(route, villageId, destinationCollegeId));
}

/**
 * Groups waiting students by village + destination inside a rolling 10-minute
 * window (`now - 10` to `now`). Because a ping expires after 20 minutes, all
 * active pings at the same origin/destination form one intact cluster. Clusters
 * form at 3+ students, or whenever the relevant government route is full or
 * unavailable (a single stranded student still needs help).
 */
export function buildClusters(
  pings: StudentPing[],
  routes: BusRoute[],
  now: number,
): StudentCluster[] {
  const waiting = activeWaitingPings(pings, now);
  const groups = new Map<string, StudentPing[]>();
  for (const ping of waiting) {
    const key = `${ping.villageId}|${ping.destinationCollegeId}`;
    const list = groups.get(key) ?? [];
    list.push(ping);
    groups.set(key, list);
  }

  const clusters: StudentCluster[] = [];
  groups.forEach((members) => {
    const first = members[0];
    const route = routeForPings(first.villageId, first.destinationCollegeId, routes);
    const routeTriggered = route ? isRouteFullOrUnavailable(route) : true;
    if (members.length < CLUSTER_MIN_STUDENTS && !routeTriggered) return;
    const id = `cluster_${first.villageId}_${first.destinationCollegeId}`;
    clusters.push({
      id,
      villageId: first.villageId,
      destinationCollegeId: first.destinationCollegeId,
      pingIds: members.map((ping) => ping.id).sort(),
      studentCount: members.length,
      windowStart: now - CLUSTER_WINDOW,
      windowEnd: now,
      allowSplitting: false,
      status: 'open',
    });
  });

  return clusters.sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function routeWaitingCount(
  route: BusRoute,
  pings: StudentPing[],
  now: number,
): number {
  return activeWaitingPings(pings, now).filter(
    (ping) =>
      ping.destinationCollegeId === route.destinationCollegeId &&
      route.stopIds.includes(ping.villageId),
  ).length;
}

export function routeAvailableSeats(route: BusRoute): number {
  if (route.status !== 'running') return 0;
  return Math.max(0, route.capacity - route.occupancy);
}

export function routeDemand(route: BusRoute, pings: StudentPing[], now: number): {
  waiting: number;
  extra: number;
  total: number;
} {
  const waiting = routeWaitingCount(route, pings, now);
  const extra = Math.round(waiting * 0.15);
  return { waiting, extra, total: waiting + extra };
}

export function routeRisk(route: BusRoute, pings: StudentPing[], now: number): number {
  const waiting = routeWaitingCount(route, pings, now);
  if (waiting === 0) return 0;
  const demand = Math.round(waiting * 0.15);
  return computeOvercrowdingRisk({
    demand,
    waiting,
    availableSeats: routeAvailableSeats(route),
    minutesToDeparture: route.minutesToDeparture,
  });
}

export function generatePlansForState(state: MobilityState): AIAllocationPlan[] {
  return allocateClusters(state.clusters, state.pings, state.vehicles, state.edges, {
    now: state.simMinutes,
    monsoon: state.monsoon,
    stops: state.stops,
    colleges: state.colleges,
    routes: state.busRoutes,
  });
}

export function buildReallocationPlans(state: MobilityState): RouteReallocationPlan[] {
  const plans: RouteReallocationPlan[] = [];
  for (const route of state.busRoutes) {
    const risk = routeRisk(route, state.pings, state.simMinutes);
    if (risk < 0.6) continue;
    const demand = routeDemand(route, state.pings, state.simMinutes);
    const before = risk;
    const addBus = simulateWhatIf(state, { kind: 'add-relief-bus', routeId: route.id, label: 'Add relief bus' });
    const frequency = simulateWhatIf(state, { kind: 'increase-frequency', routeId: route.id, label: 'Increase frequency' });
    plans.push({
      id: `realloc_${route.id}_add-bus`,
      kind: 'add-relief-bus',
      routeId: route.id,
      title: `Add a relief bus to Route ${route.code}`,
      description: `Deploy ${STANDARD_RELIEF_BUS_SEATS} extra seats on ${route.name}.`,
      capacityBefore: addBus.capacityBefore,
      capacityAfter: addBus.capacityAfter,
      demand: demand.total,
      riskBefore: Math.round(before * 100) / 100,
      riskAfter: addBus.riskAfter,
      reasoning: addBus.reasoning,
    });
    plans.push({
      id: `realloc_${route.id}_frequency`,
      kind: 'increase-frequency',
      routeId: route.id,
      title: `Increase Route ${route.code} frequency`,
      description: `Run ${route.code} more often during the morning collection window.`,
      capacityBefore: frequency.capacityBefore,
      capacityAfter: frequency.capacityAfter,
      demand: demand.total,
      riskBefore: Math.round(before * 100) / 100,
      riskAfter: frequency.riskAfter,
      reasoning: frequency.reasoning,
    });
  }
  return plans;
}

export function simulateWhatIf(
  state: MobilityState,
  proposal: WhatIfProposal,
): WhatIfResult {
  const route = state.busRoutes.find((candidate) => candidate.id === proposal.routeId);
  if (!route) {
    return {
      routeId: proposal.routeId,
      kind: proposal.kind,
      capacityBefore: 0,
      capacityAfter: 0,
      demand: 0,
      riskBefore: 0,
      riskAfter: 0,
      seatsAdded: 0,
      reasoning: ['Route not found; no simulation was performed.'],
      simulated: true,
    };
  }
  const now = state.simMinutes;
  const demand = routeDemand(route, state.pings, now);
  const seatsBefore = routeAvailableSeats(route);
  const capacityBefore = route.capacity;
  const riskBefore = routeRisk(route, state.pings, now);
  let capacityAfter = route.capacity;
  let seatsAfter = seatsBefore;
  const reasoning: string[] = [];

  switch (proposal.kind) {
    case 'add-relief-bus': {
      capacityAfter = route.capacity + STANDARD_RELIEF_BUS_SEATS;
      seatsAfter =
        route.status === 'running'
          ? seatsBefore + STANDARD_RELIEF_BUS_SEATS
          : STANDARD_RELIEF_BUS_SEATS;
      reasoning.push(
        `A relief bus adds ${STANDARD_RELIEF_BUS_SEATS} seats. The simulation holds waiting demand at ${demand.total} students and recomputes the risk formula.`,
      );
      break;
    }
    case 'increase-frequency': {
      const added = Math.round(route.capacity * 0.5);
      capacityAfter = route.capacity + added;
      seatsAfter = route.status === 'running' ? seatsBefore + added : added;
      reasoning.push(
        `A 50% frequency increase is modeled as ${added} additional effective seats during the 60-minute collection window.`,
      );
      break;
    }
    case 'emergency-stop': {
      const reachable = state.stops
        .filter((stop) => !route.stopIds.includes(stop.id))
        .map((stop) => ({
          stop,
          path: shortestPath(state.edges, stop.id, route.destinationCollegeId, { monsoon: state.monsoon }),
        }))
        .filter((entry) => entry.path !== null)
        .sort((a, b) => (a.path?.minutes ?? 0) - (b.path?.minutes ?? 0))[0];
      reasoning.push(
        reachable
          ? `An emergency feeder stop at ${reachable.stop.name} would shorten the walk for nearby students, but does not add seats; overcrowding risk is unchanged.`
          : 'No additional stop is reachable with the current road closures; overcrowding risk is unchanged.',
      );
      break;
    }
    case 'reorder-stops': {
      reasoning.push(
        'Reordering existing stops changes collection sequence and walking distance, not seat supply; overcrowding risk is unchanged.',
      );
      break;
    }
  }

  const riskAfter = computeOvercrowdingRisk({
    demand: demand.extra,
    waiting: demand.waiting,
    availableSeats: seatsAfter,
    minutesToDeparture: route.minutesToDeparture,
  });
  if (proposal.kind === 'add-relief-bus' || proposal.kind === 'increase-frequency') {
    reasoning.push(
      `Projected overcrowding risk moves from ${Math.round(riskBefore * 100)}% to ${Math.round(riskAfter * 100)}%.`,
    );
    reasoning.push(
      `Existing capacity ${capacityBefore} seats, projected capacity ${capacityAfter} seats, waiting demand ${demand.total} students. This is a simulation; no real fleet state is changed.`,
    );
  }

  return {
    routeId: route.id,
    kind: proposal.kind,
    capacityBefore,
    capacityAfter,
    demand: demand.total,
    riskBefore: Math.round(riskBefore * 100) / 100,
    riskAfter: Math.round(riskAfter * 100) / 100,
    seatsAdded: capacityAfter - capacityBefore,
    reasoning,
    simulated: true,
  };
}

/** Clusters served by a dispatch or blocked by one, used by the reducer. */
export function clusterPingIds(clusters: StudentCluster[], clusterId: string): string[] {
  return clusters.find((cluster) => cluster.id === clusterId)?.pingIds ?? [];
}
