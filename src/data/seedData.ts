import type {
  BusRoute,
  College,
  CommunityVehicle,
  GovernmentBus,
  MobilityState,
  RoadEdge,
  ScenarioConfig,
  StudentPing,
  VillageStop,
} from '../types/mobility';
import { PING_TTL_MINUTES, SIM_START_MINUTES } from '../utils/simulationClock';
import { createSeededRandom, makeId } from '../utils/seededRandom';
import { getScenario } from './scenarios';

/**
 * Deterministic seeded demo district. Place names and road distances are
 * Karnataka-inspired but the operational data is fabricated for demonstration.
 * Students are anonymized identifiers; "Meena" is a fictional demo persona.
 */

export const SEED_VERSION = 1;
export const DEFAULT_SEED = 20260214;
export const DEFAULT_SCENARIO_ID = 'normal';

export const villages: VillageStop[] = [
  {
    id: 'bantwal',
    name: 'Bantwal',
    nameKn: 'ಬಂಟ್ವಾಳ',
    nameHi: 'बंटवाल',
    x: 170,
    y: 380,
    population: 12400,
    seededWaiting: 2,
  },
  {
    id: 'adyar',
    name: 'Adyar',
    nameKn: 'ಅಡ್ಯಾರ್',
    nameHi: 'अद्यार',
    x: 330,
    y: 420,
    population: 6100,
    seededWaiting: 5,
  },
  {
    id: 'kothur',
    name: 'Kothur',
    nameKn: 'ಕೋತೂರು',
    nameHi: 'कोथूर',
    x: 520,
    y: 380,
    population: 7800,
    seededWaiting: 0,
  },
  {
    id: 'farangipete',
    name: 'Farangipete',
    nameKn: 'ಫರಂಗಿಪೇಟೆ',
    nameHi: 'फरंगीपेटे',
    x: 340,
    y: 240,
    population: 9200,
    seededWaiting: 1,
  },
  {
    id: 'vittla',
    name: 'Vittla',
    nameKn: 'ವಿಟ್ಲ',
    nameHi: 'विटला',
    x: 180,
    y: 160,
    population: 5400,
    seededWaiting: 3,
  },
  {
    id: 'mudipu',
    name: 'Mudipu',
    nameKn: 'ಮುಡಿಪು',
    nameHi: 'मुडिपु',
    x: 480,
    y: 150,
    population: 4900,
    seededWaiting: 2,
  },
  {
    id: 'melkar',
    name: 'Melkar',
    nameKn: 'ಮೆಲ್ಕಾರ್',
    nameHi: 'मेलकार',
    x: 640,
    y: 250,
    population: 3800,
    seededWaiting: 1,
  },
  {
    id: 'bc-road',
    name: 'BC Road',
    nameKn: 'ಬಿ.ಸಿ. ರೋಡ್',
    nameHi: 'बी.सी. रोड',
    x: 560,
    y: 460,
    population: 8600,
    seededWaiting: 0,
  },
  {
    id: 'kalladka',
    name: 'Kalladka',
    nameKn: 'ಕಲ್ಲಡ್ಕ',
    nameHi: 'कल्लड्का',
    x: 700,
    y: 300,
    population: 2100,
    seededWaiting: 0,
  },
];

export const colleges: College[] = [
  {
    id: 'clg-kothur',
    name: 'Sahyadri First Grade College, Kothur',
    shortName: 'Sahyadri FGC',
    x: 690,
    y: 420,
    villageId: 'kothur',
    students: 640,
  },
  {
    id: 'clg-farangipete',
    name: 'Vishwa Mangala Government College, Farangipete',
    shortName: 'Vishwa Mangala',
    x: 270,
    y: 245,
    villageId: 'farangipete',
    students: 520,
  },
];

export const roadEdges: RoadEdge[] = [
  {
    id: 'rd-bantwal-adyar',
    from: 'bantwal',
    to: 'adyar',
    distanceKm: 5.2,
    roadType: 'village',
    baseMinutes: 12,
    multiplier: 1.1,
    status: 'open',
  },
  {
    id: 'rd-adyar-kothur',
    from: 'adyar',
    to: 'kothur',
    distanceKm: 4.8,
    roadType: 'highway',
    baseMinutes: 9,
    multiplier: 1,
    status: 'open',
  },
  {
    id: 'rd-bantwal-farangipete',
    from: 'bantwal',
    to: 'farangipete',
    distanceKm: 8.4,
    roadType: 'highway',
    baseMinutes: 17,
    multiplier: 1.05,
    status: 'open',
  },
  {
    id: 'rd-farangipete-kothur',
    from: 'farangipete',
    to: 'kothur',
    distanceKm: 7.6,
    roadType: 'village',
    baseMinutes: 16,
    multiplier: 1.15,
    status: 'open',
  },
  {
    id: 'rd-vittla-farangipete',
    from: 'vittla',
    to: 'farangipete',
    distanceKm: 9.2,
    roadType: 'ghat',
    baseMinutes: 21,
    multiplier: 1.25,
    status: 'open',
  },
  {
    id: 'rd-vittla-mudipu',
    from: 'vittla',
    to: 'mudipu',
    distanceKm: 7.4,
    roadType: 'village',
    baseMinutes: 15,
    multiplier: 1.12,
    status: 'open',
  },
  {
    id: 'rd-mudipu-kothur',
    from: 'mudipu',
    to: 'kothur',
    distanceKm: 8.1,
    roadType: 'village',
    baseMinutes: 16,
    multiplier: 1.1,
    status: 'open',
  },
  {
    id: 'rd-kothur-melkar',
    from: 'kothur',
    to: 'melkar',
    distanceKm: 6.3,
    roadType: 'village',
    baseMinutes: 13,
    multiplier: 1.12,
    status: 'open',
  },
  {
    id: 'rd-melkar-bc-road',
    from: 'melkar',
    to: 'bc-road',
    distanceKm: 4.1,
    roadType: 'bridge',
    baseMinutes: 8,
    multiplier: 1,
    status: 'open',
  },
  {
    id: 'rd-bc-road-kothur',
    from: 'bc-road',
    to: 'kothur',
    distanceKm: 3.5,
    roadType: 'highway',
    baseMinutes: 7,
    multiplier: 1,
    status: 'open',
  },
  {
    id: 'rd-bantwal-bc-road',
    from: 'bantwal',
    to: 'bc-road',
    distanceKm: 6.0,
    roadType: 'highway',
    baseMinutes: 13,
    multiplier: 1.05,
    status: 'open',
  },
  {
    id: 'rd-farangipete-adyar',
    from: 'farangipete',
    to: 'adyar',
    distanceKm: 6.5,
    roadType: 'village',
    baseMinutes: 14,
    multiplier: 1.15,
    status: 'open',
  },
  {
    id: 'rd-mudipu-farangipete',
    from: 'mudipu',
    to: 'farangipete',
    distanceKm: 10.2,
    roadType: 'ghat',
    baseMinutes: 23,
    multiplier: 1.25,
    status: 'open',
  },
  {
    id: 'rd-kothur-college',
    from: 'kothur',
    to: 'clg-kothur',
    distanceKm: 1.2,
    roadType: 'village',
    baseMinutes: 3,
    multiplier: 1,
    status: 'open',
  },
  {
    id: 'rd-farangipete-college',
    from: 'farangipete',
    to: 'clg-farangipete',
    distanceKm: 0.9,
    roadType: 'village',
    baseMinutes: 2,
    multiplier: 1,
    status: 'open',
  },
  {
    id: 'rd-kalladka-melkar',
    from: 'kalladka',
    to: 'melkar',
    distanceKm: 2.6,
    roadType: 'village',
    baseMinutes: 7,
    multiplier: 1.15,
    status: 'open',
  },
];

export const busRoutes: BusRoute[] = [
  {
    id: 'route-a',
    code: 'A',
    name: 'Bantwal – Adyar – Kothur',
    stopIds: ['bantwal', 'adyar', 'kothur'],
    destinationCollegeId: 'clg-kothur',
    capacity: 48,
    seededOccupancy: 46,
    occupancy: 46,
    frequencyMinutes: 30,
    minutesToDeparture: 9,
    status: 'running',
    vehicleLabel: 'KA-19-F-4102',
  },
  {
    id: 'route-b',
    code: 'B',
    name: 'Vittla – Farangipete – Mudipu – Kothur',
    stopIds: ['vittla', 'farangipete', 'mudipu', 'kothur'],
    destinationCollegeId: 'clg-kothur',
    capacity: 52,
    seededOccupancy: 44,
    occupancy: 44,
    frequencyMinutes: 35,
    minutesToDeparture: 22,
    status: 'running',
    vehicleLabel: 'KA-19-F-2871',
  },
  {
    id: 'route-c',
    code: 'C',
    name: 'Melkar – BC Road – Bantwal – Farangipete',
    stopIds: ['melkar', 'bc-road', 'bantwal', 'farangipete'],
    destinationCollegeId: 'clg-farangipete',
    capacity: 40,
    seededOccupancy: 33,
    occupancy: 33,
    frequencyMinutes: 40,
    minutesToDeparture: 16,
    status: 'running',
    vehicleLabel: 'KA-19-F-3320',
  },
];

export const governmentBuses: GovernmentBus[] = [
  {
    id: 'bus-a',
    routeId: 'route-a',
    label: 'Route A bus',
    registration: 'KA-19-F-4102',
    capacity: 48,
    occupancy: 46,
    status: 'running',
    currentStopIndex: 1,
    progress: 0.35,
    etaMinutes: 9,
  },
  {
    id: 'bus-b',
    routeId: 'route-b',
    label: 'Route B bus',
    registration: 'KA-19-F-2871',
    capacity: 52,
    occupancy: 44,
    status: 'running',
    currentStopIndex: 1,
    progress: 0.5,
    etaMinutes: 22,
  },
  {
    id: 'bus-c',
    routeId: 'route-c',
    label: 'Route C bus',
    registration: 'KA-19-F-3320',
    capacity: 40,
    occupancy: 33,
    status: 'running',
    currentStopIndex: 2,
    progress: 0.2,
    etaMinutes: 16,
  },
];

export const reliefVehicles: CommunityVehicle[] = [
  {
    id: 'veh-relief-bus-c',
    label: 'Relief bus (Route C)',
    kind: 'minibus',
    driverName: 'Manjunath Shetty',
    driverRating: 4.5,
    verificationTier: 'Depot-registered',
    seats: 40,
    availableSeats: 40,
    baseFare: 40,
    farePerKm: 3,
    available: true,
    daylightOnly: true,
    currentStopId: 'melkar',
    speedFactor: 0.85,
    sourceBusId: 'bus-c',
    sourceRouteId: 'route-c',
    relief: true,
  },
];

export const communityVehicles: CommunityVehicle[] = [
  {
    id: 'veh-auto-3',
    label: 'Auto-3',
    kind: 'auto',
    driverName: 'Ramesh Poojary',
    driverRating: 4.8,
    verificationTier: 'ID-verified',
    seats: 6,
    availableSeats: 6,
    baseFare: 40,
    farePerKm: 8,
    available: true,
    daylightOnly: true,
    currentStopId: 'adyar',
    speedFactor: 1,
  },
  {
    id: 'veh-van-1',
    label: 'Feeder Van-1',
    kind: 'feeder-van',
    driverName: 'Sulochana Hegde',
    driverRating: 4.6,
    verificationTier: 'Depot-registered',
    seats: 12,
    availableSeats: 12,
    baseFare: 60,
    farePerKm: 7,
    available: true,
    daylightOnly: true,
    currentStopId: 'bantwal',
    speedFactor: 0.9,
  },
  {
    id: 'veh-carpool-2',
    label: 'Carpool-2',
    kind: 'carpool',
    driverName: 'Girish Kamath',
    driverRating: 4.4,
    verificationTier: 'Community-vouched',
    seats: 4,
    availableSeats: 4,
    baseFare: 30,
    farePerKm: 6,
    available: true,
    daylightOnly: true,
    currentStopId: 'kothur',
    speedFactor: 0.95,
  },
  {
    id: 'veh-auto-7',
    label: 'Auto-7',
    kind: 'auto',
    driverName: 'Bhaskar Naik',
    driverRating: 3.9,
    verificationTier: 'Unverified',
    seats: 3,
    availableSeats: 3,
    baseFare: 35,
    farePerKm: 9,
    available: true,
    daylightOnly: true,
    currentStopId: 'melkar',
    speedFactor: 1,
  },
];

interface SeedPingSpec {
  villageId: string;
  destinationCollegeId: string;
  count: number;
  aliasPrefix: string;
  source: 'app' | 'sms' | 'proxy';
  offsetMinutes: number;
  note?: string;
}

const SEED_PING_GROUPS: SeedPingSpec[] = [
  {
    villageId: 'adyar',
    destinationCollegeId: 'clg-kothur',
    count: 5,
    aliasPrefix: 'STU-AD',
    source: 'app',
    offsetMinutes: 6,
    note: 'Waiting after Route A filled at Adyar',
  },
  {
    villageId: 'vittla',
    destinationCollegeId: 'clg-kothur',
    count: 3,
    aliasPrefix: 'STU-VT',
    source: 'app',
    offsetMinutes: 4,
  },
  {
    villageId: 'mudipu',
    destinationCollegeId: 'clg-kothur',
    count: 2,
    aliasPrefix: 'STU-MD',
    source: 'app',
    offsetMinutes: 2,
  },
  {
    villageId: 'bantwal',
    destinationCollegeId: 'clg-kothur',
    count: 2,
    aliasPrefix: 'STU-BN',
    source: 'proxy',
    offsetMinutes: 8,
    note: 'Pinged by village coordinator',
  },
  {
    villageId: 'farangipete',
    destinationCollegeId: 'clg-farangipete',
    count: 1,
    aliasPrefix: 'STU-FP',
    source: 'sms',
    offsetMinutes: 1,
  },
  {
    villageId: 'melkar',
    destinationCollegeId: 'clg-farangipete',
    count: 1,
    aliasPrefix: 'STU-ML',
    source: 'app',
    offsetMinutes: 3,
    note: 'Separated from Route C',
  },
];

/**
 * The exam-day baseline is derived from the scenario seed. It is rounded to a
 * multiple of five so the 40% lift is an exact integer, not a rounded-up
 * approximation. Nothing here is a fixed student count.
 */
export const EXAM_DEMAND_LIFT = 0.4;

export function crisisBaselineDemand(seed: number): number {
  return 5 * (8 + (seed % 6));
}

export function crisisTargetDemand(seed: number): number {
  return Math.round(crisisBaselineDemand(seed) * (1 + EXAM_DEMAND_LIFT));
}

/**
 * Exam-day seed: an additional walk-only hamlet, enough demand to exceed the
 * available relief seats, and exam deadlines spread across 30–120 minutes.
 * Meena is included so the student view has an exam-priority example.
 */
export function createCrisisPings(now: number, seed: number): StudentPing[] {
  const random = createSeededRandom(`${seed}|exam-crisis-demand`);
  const weighted = villages.filter((village) => village.seededWaiting > 0);
  const totalWeight = weighted.reduce((sum, village) => sum + village.seededWaiting, 0);
  const target = crisisTargetDemand(seed);
  const examCount = 8 + (seed % 5);
  const pings: StudentPing[] = [];

  for (let index = 0; index < target; index += 1) {
    let village = weighted[0];
    if (index === 0) {
      village = villages.find((candidate) => candidate.id === 'adyar') ?? weighted[0];
    } else if (index <= 3) {
      village = villages.find((candidate) => candidate.id === 'kalladka') ?? weighted[0];
    } else {
      let pick = random() * totalWeight;
      for (const candidate of weighted) {
        pick -= candidate.seededWaiting;
        if (pick <= 0) {
          village = candidate;
          break;
        }
      }
    }

    const farangCorridor = ['farangipete', 'melkar', 'bc-road'].includes(village.id);
    const destinationCollegeId =
      random() < (farangCorridor ? 0.65 : 0.25) ? 'clg-farangipete' : 'clg-kothur';
    const alias = index === 0 ? 'STU-AD-100' : `STU-CR-${String(index + 1).padStart(3, '0')}`;
    const hasExam = index < examCount;
    const examStartMin = !hasExam
      ? undefined
      : index === 0
        ? now + 78
        : now + 30 + Math.floor(random() * 91);
    const source = index % 3 === 0 ? 'app' : index % 3 === 1 ? 'sms' : 'proxy';
    pings.push({
      id: index === 0 ? makeId('ping', 'STU-AD-100-crisis', 0) : makeId('ping', `${alias}-crisis`, index),
      studentAlias: alias,
      villageId: village.id,
      destinationCollegeId,
      createdAt: now - (index % 9),
      expiresAt: now - (index % 9) + PING_TTL_MINUTES,
      status: 'waiting',
      isMinor: true,
      consentRequired: true,
      source,
      ...(hasExam ? { examStartMin } : {}),
      note:
        village.id === 'kalladka'
          ? 'Kalladka road flooded; nearest reachable pickup required'
          : 'Exam-day crisis seeded demand',
    });
  }
  return pings;
}

export function createSeededPings(now: number): StudentPing[] {
  const pings: StudentPing[] = [];
  SEED_PING_GROUPS.forEach((group) => {
    for (let index = 0; index < group.count; index += 1) {
      const serial = String(index + 1).padStart(3, '0');
      const id = makeId('ping', `${group.aliasPrefix}-${serial}`, group.offsetMinutes);
      pings.push({
        id,
        studentAlias: `${group.aliasPrefix}-${serial}`,
        villageId: group.villageId,
        destinationCollegeId: group.destinationCollegeId,
        createdAt: now - group.offsetMinutes,
        expiresAt: now - group.offsetMinutes + PING_TTL_MINUTES,
        status: 'waiting',
        isMinor: true,
        consentRequired: true,
        source: group.source,
        ...(group.note ? { note: group.note } : {}),
      });
    }
  });
  return pings;
}

function buildBuses(routes: BusRoute[], scenario: ScenarioConfig): GovernmentBus[] {
  return governmentBuses.map((bus) => {
    const route = routes.find((candidate) => candidate.id === bus.routeId);
    const brokenDown = scenario.breakdownRouteIds.includes(bus.routeId);
    const cancelled = scenario.cancelledRouteIds.includes(bus.routeId);
    return {
      ...bus,
      capacity: route ? route.capacity : bus.capacity,
      occupancy: route ? route.occupancy : bus.occupancy,
      etaMinutes: route ? route.minutesToDeparture : bus.etaMinutes,
      status: brokenDown ? 'breakdown' : cancelled ? 'cancelled' : 'running',
    };
  });
}

function applyScenario(
  scenario: ScenarioConfig,
): { edges: RoadEdge[]; routes: BusRoute[] } {
  const edges = roadEdges.map((edge) => ({
    ...edge,
    status: scenario.floodedEdgeIds?.includes(edge.id)
      ? ('flooded' as const)
      : scenario.closedEdgeIds.includes(edge.id)
        ? ('closed' as const)
        : edge.id === 'rd-vittla-farangipete' && scenario.monsoon
          ? ('flooded' as const)
          : ('open' as const),
  }));
  const routes = busRoutes.map((route) => {
    const cancelled = scenario.cancelledRouteIds.includes(route.id);
    const brokenDown = scenario.breakdownRouteIds.includes(route.id);
    return {
      ...route,
      status: brokenDown ? ('breakdown' as const) : cancelled ? ('cancelled' as const) : ('running' as const),
      occupancy: cancelled
        ? 0
        : (scenario.routeOccupancyOverrides?.[route.id] ?? route.seededOccupancy),
      minutesToDeparture: route.minutesToDeparture,
    };
  });
  return { edges, routes };
}

/** Seeded starting routes, used as the fixed no-action baseline. */
export function scenarioBaselineRoutes(scenarioId: string): BusRoute[] {
  return applyScenario(getScenario(scenarioId)).routes.map((route) => ({ ...route }));
}

export function createInitialState(scenarioId = DEFAULT_SCENARIO_ID): MobilityState {
  const scenario = getScenario(scenarioId);
  const now = scenario.simulatedTime;
  const { edges, routes } = applyScenario(scenario);
  const buses = buildBuses(routes, scenario);
  const pings = scenario.id === 'exam-crisis' ? createCrisisPings(now, scenario.seed) : createSeededPings(now);
  const demandByVillage: Record<string, number> = {};
  villages.forEach((village) => {
    demandByVillage[village.id] = pings.filter(
      (ping) =>
        ping.villageId === village.id &&
        (ping.status === 'waiting' || ping.status === 'clustered'),
    ).length;
  });
  const crisisVehicles = scenario.reliefBusIds?.length
    ? reliefVehicles
        .filter((vehicle) => scenario.reliefBusIds?.includes(vehicle.sourceBusId ?? ''))
        .map((vehicle) => {
          const sourceBus = buses.find((bus) => bus.id === vehicle.sourceBusId);
          const sourceRoute = routes.find((route) => route.id === sourceBus?.routeId);
          // The relief vehicle starts exactly where its source bus is now; the
          // bus cannot teleport to a convenient depot.
          const currentStopId =
            sourceRoute?.stopIds[sourceBus?.currentStopIndex ?? 0] ?? vehicle.currentStopId;
          return {
            ...vehicle,
            currentStopId,
            readinessMinutes: sourceBus?.etaMinutes ?? 0,
          };
        })
    : [];

  return {
    version: 1,
    seed: scenario.seed,
    scenarioId: scenario.id,
    simMinutes: now,
    clockRunning: false,
    monsoon: scenario.monsoon,
    examDay: scenario.examDay,
    santheDay: scenario.santheDay,
    festival: scenario.festival,
    demandMultiplier: scenario.demandMultiplier,
    language: 'en',
    view: 'coordinator',
    stops: villages.map((village) => ({ ...village })),
    colleges: colleges.map((college) => ({ ...college })),
    edges,
    busRoutes: routes,
    buses,
    pings,
    clusters: [],
    vehicles: [...communityVehicles, ...crisisVehicles].map((vehicle) => ({ ...vehicle })),
    plans: [],
    reallocations: [],
    dispatches: [],
    decisionLog: [
      {
        id: makeId('log', `${scenario.id}-boot`, 0),
        at: now,
        kind: 'system',
        actor: 'system',
        message: `GramRoute AI demo initialized with scenario "${scenario.name}" and seed ${scenario.seed}. All demand is simulated.`,
      },
      {
        id: makeId('log', `${scenario.id}-demand`, 1),
        at: now,
        kind: 'request',
        actor: 'system',
        message:
          scenario.id === 'exam-crisis'
            ? `${pings.length} seeded exam-day pings loaded (${crisisBaselineDemand(scenario.seed)} baseline + ${Math.round(EXAM_DEMAND_LIFT * 100)}% = ${crisisTargetDemand(scenario.seed)}). ${pings.filter((ping) => ping.examStartMin !== undefined).length} students have exams in the next 30–120 minutes. Two buses are out and Kalladka is cut off by flooding.`
            : `${pings.length} seeded student pings loaded across ${new Set(pings.map((p) => p.villageId)).size} villages.`,
      },
    ],
    impact: {
      studentsRescued: 0,
      rupeesSaved: 0,
      waitingMinutesSaved: 0,
      tripsCompleted: 0,
      vehicleUtilization: 0,
      projectedStudents: 0,
      projectedRupees: 0,
    },
    demo: {
      active: false,
      step: 0,
      totalSteps: 12,
      playing: false,
    },
    appliedActionIds: [],
    lastTickDemand: demandByVillage,
    studentProfile: {
      alias: 'STU-AD-100',
      name: 'Meena',
      villageId: 'adyar',
      collegeId: 'clg-kothur',
      isMinor: true,
      guardianLabel: 'Meena’s guardian (demo)',
    },
  };
}

export function getVillageById(state: MobilityState, id: string): VillageStop | undefined {
  return state.stops.find((stop) => stop.id === id);
}

export function getCollegeById(state: MobilityState, id: string): College | undefined {
  return state.colleges.find((college) => college.id === id);
}

export function getVehicleById(state: MobilityState, id: string): CommunityVehicle | undefined {
  return state.vehicles.find((vehicle) => vehicle.id === id);
}

export function defaultSimTime(): number {
  return SIM_START_MINUTES;
}
