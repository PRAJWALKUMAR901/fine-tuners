import { describe, expect, it } from 'vitest';
import type { RoadEdge, StudentCluster, StudentPing } from '../src/types/mobility';
import { createRuntimeState } from '../src/state/mobilityReducer';
import {
  buildClusters,
  computeOvercrowdingRisk,
  routeRisk,
  isRouteFullOrUnavailable,
} from '../src/services/routeOptimizer';
import { shortestPath } from '../src/services/graphRouter';

describe('overcrowding risk', () => {
  it('is zero when there is no demand and critical when full with demand', () => {
    expect(
      computeOvercrowdingRisk({
        demand: 0,
        waiting: 0,
        availableSeats: 0,
        minutesToDeparture: 0,
      }),
    ).toBe(0);
    expect(
      computeOvercrowdingRisk({
        demand: 4,
        waiting: 0,
        availableSeats: 0,
        minutesToDeparture: 5,
      }),
    ).toBe(1);
  });

  it('never decreases when demand increases with all other inputs fixed', () => {
    let previous = -1;
    for (let demand = 0; demand <= 30; demand += 1) {
      const risk = computeOvercrowdingRisk({
        demand,
        waiting: 4,
        availableSeats: 12,
        minutesToDeparture: 20,
      });
      expect(risk).toBeGreaterThanOrEqual(previous);
      expect(risk).toBeGreaterThanOrEqual(0);
      expect(risk).toBeLessThanOrEqual(1);
      previous = risk;
    }
  });

  it('does not decrease as departure approaches', () => {
    let previous = -1;
    for (let minutes = 60; minutes >= 0; minutes -= 1) {
      const risk = computeOvercrowdingRisk({
        demand: 6,
        waiting: 3,
        availableSeats: 15,
        minutesToDeparture: minutes,
      });
      expect(risk).toBeGreaterThanOrEqual(previous);
      previous = risk;
    }
  });

  it('uses low/medium/high bands and treats an unavailable route as critical risk', () => {
    expect(
      computeOvercrowdingRisk({
        demand: 1,
        waiting: 1,
        availableSeats: 30,
        minutesToDeparture: 60,
      }),
    ).toBeLessThan(0.6);
    const state = createRuntimeState('normal');
    const route = state.busRoutes.find((candidate) => candidate.id === 'route-a');
    expect(route).toBeDefined();
    if (!route) return;
    const risk = routeRisk({ ...route, status: 'breakdown' }, state.pings, state.simMinutes);
    expect(risk).toBe(1);
  });
});

describe('demand clustering', () => {
  it('keeps all waiting Adyar students in one intact cluster', () => {
    const state = createRuntimeState('normal');
    const adyar = state.clusters.find(
      (cluster) => cluster.villageId === 'adyar' && cluster.destinationCollegeId === 'clg-kothur',
    );
    expect(adyar).toBeDefined();
    expect(adyar?.studentCount).toBe(5);
    expect(adyar?.allowSplitting).toBe(false);
    expect(new Set(adyar?.pingIds).size).toBe(5);
  });

  it('creates a cluster for a single student when the route is full', () => {
    const now = 500;
    const ping: StudentPing = {
      id: 'ping-lone',
      studentAlias: 'STU-TEST-1',
      villageId: 'adyar',
      destinationCollegeId: 'clg-kothur',
      createdAt: now - 2,
      expiresAt: now + 18,
      status: 'waiting',
      isMinor: true,
      consentRequired: true,
      source: 'app',
    };
    const state = createRuntimeState('normal');
    const fullRoutes = state.busRoutes.map((route) =>
      route.id === 'route-a' ? { ...route, occupancy: route.capacity } : route,
    );
    expect(isRouteFullOrUnavailable(fullRoutes[0])).toBe(true);
    const clusters = buildClusters([ping], fullRoutes, now);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].studentCount).toBe(1);
    expect(clusters[0].allowSplitting).toBe(false);
  });

  it('expires stale pings from clustering', () => {
    const state = createRuntimeState('normal');
    const now = state.simMinutes;
    const expired = state.pings.map((ping) => ({ ...ping, expiresAt: now - 1 }));
    expect(buildClusters(expired, state.busRoutes, now)).toHaveLength(0);
  });

  it('ignores pings outside the rolling 10-minute cluster window', () => {
    const now = 420;
    const route = createRuntimeState('normal').busRoutes.find((candidate) => candidate.id === 'route-a');
    expect(route).toBeDefined();
    if (!route) return;
    const stale1: StudentPing = {
      id: 'ping-old-1',
      studentAlias: 'STU-OLD-1',
      villageId: 'adyar',
      destinationCollegeId: 'clg-kothur',
      createdAt: now - 30,
      expiresAt: now + 20,
      status: 'waiting',
      isMinor: true,
      consentRequired: true,
      source: 'app',
    };
    const stale2: StudentPing = {
      id: 'ping-old-2',
      studentAlias: 'STU-OLD-2',
      villageId: 'adyar',
      destinationCollegeId: 'clg-kothur',
      createdAt: now - 25,
      expiresAt: now + 20,
      status: 'waiting',
      isMinor: true,
      consentRequired: true,
      source: 'sms',
    };
    const recent1: StudentPing = {
      ...stale1,
      id: 'ping-recent-1',
      studentAlias: 'STU-REC-1',
      createdAt: now - 5,
      expiresAt: now + 20,
    };
    const recent2: StudentPing = {
      ...stale1,
      id: 'ping-recent-2',
      studentAlias: 'STU-REC-2',
      createdAt: now - 8,
      expiresAt: now + 20,
    };

    const clusters = buildClusters([stale1, stale2, recent1, recent2], [route], now);
    expect(clusters).toHaveLength(0);
  });
});

describe('graph routing', () => {
  it('never uses a closed road', () => {
    const state = createRuntimeState('normal');
    const edges: RoadEdge[] = state.edges.map((edge) =>
      edge.id === 'rd-adyar-kothur' ? { ...edge, status: 'closed' as const } : edge,
    );
    const path = shortestPath(edges, 'adyar', 'clg-kothur', { monsoon: false });
    expect(path).not.toBeNull();
    expect(path?.edgeIds).not.toContain('rd-adyar-kothur');
    expect(path?.nodes).toContain('bantwal');
    expect(path?.minutes).toBeGreaterThan(0);
  });

  it('returns null when no feasible path exists', () => {
    const state = createRuntimeState('normal');
    const edges: RoadEdge[] = state.edges.filter((edge) => edge.id === 'rd-bantwal-adyar');
    const path = shortestPath(edges, 'adyar', 'clg-kothur', { monsoon: false });
    expect(path).toBeNull();
  });

  it('applies monsoon travel-time increases to every edge', () => {
    const state = createRuntimeState('normal');
    const dry = shortestPath(state.edges, 'adyar', 'clg-kothur', { monsoon: false });
    const wet = shortestPath(state.edges, 'adyar', 'clg-kothur', { monsoon: true });
    expect(dry).not.toBeNull();
    expect(wet).not.toBeNull();
    expect(wet?.minutes).toBeGreaterThan(dry?.minutes ?? 0);
  });
});

describe('route optimizer determinism', () => {
  it('produces deterministic clusters and plans for a fixed seeded state', () => {
    const first = createRuntimeState('normal');
    const second = createRuntimeState('normal');
    expect(first.clusters).toEqual(second.clusters);
    expect(first.plans).toEqual(second.plans);
    expect(first.reallocations).toEqual(second.reallocations);

    const adyarCluster = first.clusters.find(
      (cluster) => cluster.villageId === 'adyar',
    ) as StudentCluster;
    const adyarPlans = first.plans.filter((plan) => plan.clusterId === adyarCluster.id);
    expect(adyarPlans.length).toBeGreaterThan(0);
    expect(adyarPlans[0].reasoning.length).toBeGreaterThan(2);
  });
});
