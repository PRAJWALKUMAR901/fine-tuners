import { describe, expect, it } from 'vitest';
import type { StudentCluster, StudentPing } from '../src/types/mobility';
import { createRuntimeState, mobilityReducer } from '../src/state/mobilityReducer';
import { actionCreators } from '../src/state/actions';
import { allocateClusters } from '../src/services/allocation';

function adyarContext(state: ReturnType<typeof createRuntimeState>) {
  return {
    now: state.simMinutes,
    monsoon: state.monsoon,
    stops: state.stops,
    colleges: state.colleges,
  };
}

describe('capacity-constrained cluster allocation', () => {
  it('never assigns more students than available seats', () => {
    const state = createRuntimeState('normal');
    const plans = state.plans.filter((plan) => plan.feasibilityStatus !== 'infeasible');
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      const vehicle = state.vehicles.find((candidate) => candidate.id === plan.vehicleIds[0]);
      expect(vehicle).toBeDefined();
      expect(plan.studentsCovered).toBeLessThanOrEqual(vehicle?.availableSeats ?? 0);
      expect(plan.studentsCovered).toBeLessThanOrEqual(vehicle?.seats ?? 0);
    }
  });

  it('keeps an intact cluster intact rather than splitting it across vehicles', () => {
    const state = createRuntimeState('normal');
    const cluster = state.clusters.find((candidate) => candidate.villageId === 'adyar');
    expect(cluster).toBeDefined();
    if (!cluster) return;
    const plans = state.plans.filter((plan) => plan.clusterId === cluster.id);
    const feasible = plans.filter((plan) => plan.feasibilityStatus !== 'infeasible');
    expect(feasible.length).toBeGreaterThan(0);
    for (const plan of feasible) {
      expect(plan.studentsCovered).toBe(cluster.studentCount);
      expect(plan.vehicleIds).toHaveLength(1);
    }
  });

  it('rejects a cluster larger than every vehicle instead of splitting it', () => {
    const state = createRuntimeState('normal');
    const smallVehicles = state.vehicles.map((vehicle) => ({
      ...vehicle,
      seats: 4,
      availableSeats: 4,
    }));
    const cluster: StudentCluster = {
      id: 'cluster_test_large',
      villageId: 'adyar',
      destinationCollegeId: 'clg-kothur',
      pingIds: [],
      studentCount: 6,
      windowStart: state.simMinutes - 10,
      windowEnd: state.simMinutes,
      allowSplitting: false,
      status: 'open',
    };
    const plans = allocateClusters([cluster], [], smallVehicles, state.edges, adyarContext(state));
    expect(plans).toHaveLength(1);
    expect(plans[0].feasibilityStatus).toBe('infeasible');
    expect(plans[0].studentsCovered).toBe(0);
    expect(plans[0].reasoning.join(' ')).toMatch(/seat/i);
  });

  it('enforces the unverified-driver lone-minor safety rule', () => {
    const state = createRuntimeState('normal');
    const ping: StudentPing = {
      id: 'ping_minor',
      studentAlias: 'STU-MINOR',
      villageId: 'melkar',
      destinationCollegeId: 'clg-farangipete',
      createdAt: state.simMinutes,
      expiresAt: state.simMinutes + 20,
      status: 'waiting',
      isMinor: true,
      consentRequired: true,
      source: 'app',
    };
    const cluster: StudentCluster = {
      id: 'cluster_minor',
      villageId: 'melkar',
      destinationCollegeId: 'clg-farangipete',
      pingIds: [ping.id],
      studentCount: 1,
      windowStart: state.simMinutes - 10,
      windowEnd: state.simMinutes,
      allowSplitting: false,
      status: 'open',
    };
    const unverifiedOnly = state.vehicles
      .filter((vehicle) => vehicle.id === 'veh-auto-7')
      .map((vehicle) => ({ ...vehicle, available: true, availableSeats: vehicle.seats }));
    expect(unverifiedOnly[0].verificationTier).toBe('Unverified');
    const plans = allocateClusters([cluster], [ping], unverifiedOnly, state.edges, adyarContext(state));
    expect(plans[0].feasibilityStatus).toBe('infeasible');
    expect(plans[0].reasoning.join(' ')).toMatch(/unverified|lone minor/i);
  });

  it('remains deterministic and produces feasible, explained plans', () => {
    const state = createRuntimeState('normal');
    const first = allocateClusters(state.clusters, state.pings, state.vehicles, state.edges, adyarContext(state));
    const second = allocateClusters(state.clusters, state.pings, state.vehicles, state.edges, adyarContext(state));
    expect(first).toEqual(second);
    const feasible = first.filter((plan) => plan.feasibilityStatus !== 'infeasible');
    expect(feasible.length).toBeGreaterThan(0);
    for (const plan of feasible) {
      expect(plan.reasoning.join(' ')).toContain('₹');
      expect(plan.reasoning.join(' ')).toContain('verification tier');
      expect(plan.totalCost).toBeGreaterThan(0);
      expect(plan.soloFareComparison).toBeGreaterThan(plan.costPerStudent);
    }
  });

  it('includes a newly requested student in the intact cluster and match', () => {
    let state = createRuntimeState('normal');
    const before = state.clusters.find((candidate) => candidate.villageId === 'adyar');
    expect(before?.studentCount).toBe(5);
    state = mobilityReducer(
      state,
      actionCreators.requestPing('adyar', 'clg-kothur', 'app', state.studentProfile.alias),
    );
    const after = state.clusters.find((candidate) => candidate.villageId === 'adyar');
    expect(after?.studentCount).toBe(6);
    const plan = state.plans.find(
      (candidate) => candidate.clusterId === after?.id && candidate.feasibilityStatus !== 'infeasible',
    );
    expect(plan?.studentsCovered).toBe(6);
    expect(plan?.vehicleIds[0]).toBe('veh-auto-3');
    expect(plan?.costPerStudent).toBeGreaterThan(0);
  });
});
