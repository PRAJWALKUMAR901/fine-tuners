import type { ScenarioConfig } from '../types/mobility';
import { SIM_START_MINUTES } from '../utils/simulationClock';

/**
 * Seeded scenarios. Each scenario has its own deterministic seed so the same
 * scenario always reproduces the same pings, demand, plans and backtest.
 */
export const scenarios: ScenarioConfig[] = [
  {
    id: 'normal',
    name: 'Normal school day',
    description: 'A regular pre-college morning: three routes running, modest overflow at Adyar.',
    seed: 20260214,
    monsoon: false,
    examDay: false,
    santheDay: false,
    festival: false,
    closedEdgeIds: [],
    cancelledRouteIds: [],
    breakdownRouteIds: [],
    demandMultiplier: 1,
    simulatedTime: SIM_START_MINUTES,
  },
  {
    id: 'heavy-rain',
    name: 'Heavy monsoon rain',
    description: 'Flooded Adyar–Kothur and Melkar–BC Road links; travel times increase by 40%.',
    seed: 20260301,
    monsoon: true,
    examDay: false,
    santheDay: false,
    festival: false,
    closedEdgeIds: ['rd-adyar-kothur', 'rd-melkar-bc-road'],
    cancelledRouteIds: [],
    breakdownRouteIds: [],
    demandMultiplier: 1.1,
    simulatedTime: SIM_START_MINUTES,
  },
  {
    id: 'exam-surge',
    name: 'Examination-day surge',
    description: 'Exam-day demand is 35% higher, with earlier arrivals expected at both colleges.',
    seed: 20260315,
    monsoon: false,
    examDay: true,
    santheDay: false,
    festival: false,
    closedEdgeIds: [],
    cancelledRouteIds: [],
    breakdownRouteIds: [],
    demandMultiplier: 1.35,
    simulatedTime: SIM_START_MINUTES,
  },
  {
    id: 'bus-breakdown',
    name: 'Route A bus breakdown',
    description: 'The Route A bus is unavailable, stranding students between Adyar and Kothur.',
    seed: 20260322,
    monsoon: false,
    examDay: false,
    santheDay: false,
    festival: false,
    closedEdgeIds: [],
    cancelledRouteIds: [],
    breakdownRouteIds: ['route-a'],
    demandMultiplier: 1,
    simulatedTime: SIM_START_MINUTES,
  },
  {
    id: 'road-closure',
    name: 'Adyar–Kothur road closure',
    description: 'A culvert failure closes the direct Adyar–Kothur road; paths must reroute via Bantwal.',
    seed: 20260405,
    monsoon: true,
    examDay: false,
    santheDay: true,
    festival: false,
    closedEdgeIds: ['rd-adyar-kothur'],
    cancelledRouteIds: [],
    breakdownRouteIds: [],
    demandMultiplier: 1.05,
    simulatedTime: SIM_START_MINUTES,
  },
  {
    id: 'exam-crisis',
    name: 'Exam-Day Crisis',
    description:
      'Two government buses are out, demand is 40% above the seeded exam-day baseline, and a flooded link cuts off Kalladka. Exam students must be prioritised.',
    seed: 20260718,
    monsoon: false,
    examDay: true,
    santheDay: false,
    festival: false,
    closedEdgeIds: [],
    floodedEdgeIds: ['rd-kalladka-melkar'],
    cancelledRouteIds: [],
    breakdownRouteIds: ['route-a', 'route-b'],
    reliefBusIds: ['bus-c'],
    routeOccupancyOverrides: { 'route-c': 12 },
    demandMultiplier: 1.4,
    simulatedTime: SIM_START_MINUTES,
  },
  {
    id: 'route-cancellation',
    name: 'Route B cancellation',
    description: 'Route B is cancelled, displacing Vittla and Mudipu students.',
    seed: 20260412,
    monsoon: false,
    examDay: false,
    santheDay: true,
    festival: false,
    closedEdgeIds: [],
    cancelledRouteIds: ['route-b'],
    breakdownRouteIds: [],
    demandMultiplier: 1.08,
    simulatedTime: SIM_START_MINUTES,
  },
];

export const DEFAULT_SCENARIO = scenarios[0];

export function getScenario(id: string): ScenarioConfig {
  return scenarios.find((scenario) => scenario.id === id) ?? scenarios[0];
}

export function scenarioSeed(id: string): number {
  return getScenario(id).seed;
}

/** Scenario seed mixed with a purpose so different simulations do not share streams. */
export function derivedSeed(seed: number, purpose: string): number {
  let hash = seed >>> 0;
  for (let index = 0; index < purpose.length; index += 1) {
    hash = Math.imul(hash ^ purpose.charCodeAt(index), 16777619) >>> 0;
  }
  return hash >>> 0;
}
