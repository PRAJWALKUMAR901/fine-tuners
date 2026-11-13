/**
 * GramRoute AI — domain model.
 *
 * All identifiers are stable strings. All time-dependent engine functions accept
 * an explicit `now` (simulated minutes since midnight) so they stay deterministic.
 * Simulated data only: no real student personal data is used.
 */

export type Language = 'en' | 'kn' | 'hi';

export type RoadType = 'highway' | 'village' | 'ghat' | 'bridge';

export type EdgeStatus = 'open' | 'closed' | 'flooded';

export type BusStatus = 'running' | 'cancelled' | 'breakdown';

export type VerificationTier =
  | 'ID-verified'
  | 'Depot-registered'
  | 'Community-vouched'
  | 'Unverified';

export type VehicleKind = 'auto' | 'feeder-van' | 'carpool' | 'minibus';

export type PingStatus =
  | 'waiting'
  | 'clustered'
  | 'matched'
  | 'reserved'
  | 'boarded'
  | 'expired'
  | 'cancelled';

export type ClusterStatus = 'open' | 'matched' | 'served' | 'unserved' | 'expired';

export type FeasibilityStatus = 'feasible' | 'degraded' | 'infeasible';

export type DispatchStatus =
  | 'requested'
  | 'matched'
  | 'guardian_consented'
  | 'approved'
  | 'dispatched'
  | 'completed'
  | 'cancelled';

export type ConsentStatus = 'not_required' | 'pending' | 'confirmed' | 'declined';

export type RiskBand = 'low' | 'medium' | 'high' | 'critical';

export type LogKind =
  | 'system'
  | 'request'
  | 'match'
  | 'consent'
  | 'approval'
  | 'dispatch'
  | 'completion'
  | 'cancellation'
  | 'disruption'
  | 'safety'
  | 'simulation';

export type ReallocationKind =
  | 'add-relief-bus'
  | 'increase-frequency'
  | 'emergency-stop'
  | 'reorder-stops';

export type DemoTripState = 'idle' | 'running' | 'paused' | 'completed';

export interface VillageStop {
  id: string;
  name: string;
  nameKn: string;
  nameHi: string;
  x: number;
  y: number;
  population: number;
  /** Seeded students waiting at this stop for a college bus. */
  seededWaiting: number;
}

export interface College {
  id: string;
  name: string;
  shortName: string;
  x: number;
  y: number;
  villageId: string;
  students: number;
}

export interface RoadEdge {
  id: string;
  from: string;
  to: string;
  distanceKm: number;
  roadType: RoadType;
  baseMinutes: number;
  /** Road-condition travel-time multiplier (e.g. 1.15 for rough village road). */
  multiplier: number;
  status: EdgeStatus;
}

export interface BusRoute {
  id: string;
  code: string;
  name: string;
  stopIds: string[];
  destinationCollegeId: string;
  capacity: number;
  /** Seeded occupancy before any simulation changes. */
  seededOccupancy: number;
  occupancy: number;
  frequencyMinutes: number;
  minutesToDeparture: number;
  status: BusStatus;
  vehicleLabel: string;
}

export interface GovernmentBus {
  id: string;
  routeId: string;
  label: string;
  registration: string;
  capacity: number;
  occupancy: number;
  status: BusStatus;
  currentStopIndex: number;
  /** Position along the current leg, 0..1. */
  progress: number;
  etaMinutes: number;
}

export interface StudentPing {
  id: string;
  studentAlias: string;
  villageId: string;
  destinationCollegeId: string;
  createdAt: number;
  expiresAt: number;
  status: PingStatus;
  isMinor: boolean;
  consentRequired: boolean;
  source: 'app' | 'sms' | 'proxy';
  note?: string;
  /** Absolute simulated minute of the exam start, when this student has one. */
  examStartMin?: number;
}

export interface StudentCluster {
  id: string;
  villageId: string;
  destinationCollegeId: string;
  pingIds: string[];
  studentCount: number;
  windowStart: number;
  windowEnd: number;
  allowSplitting: boolean;
  status: ClusterStatus;
}

export interface CommunityVehicle {
  id: string;
  label: string;
  kind: VehicleKind;
  driverName: string;
  driverRating: number;
  verificationTier: VerificationTier;
  seats: number;
  availableSeats: number;
  baseFare: number;
  farePerKm: number;
  available: boolean;
  daylightOnly: boolean;
  currentStopId: string;
  speedFactor: number;
  /** Set when an existing government bus is temporarily operating as relief. */
  sourceBusId?: string;
  sourceRouteId?: string;
  relief?: boolean;
  /** Minutes before this vehicle can leave its current duty and reposition. */
  readinessMinutes?: number;
}

export interface ExamOutlook {
  pingId: string;
  alias: string;
  examStartMin: number;
  etaMinutes: number;
  /** Minutes between college arrival plus the 15-minute buffer and the exam. */
  slackMinutes: number;
  onTime: boolean;
  reason: string;
}

export interface StudentPriority {
  pingId: string;
  alias: string;
  rank: number;
  category: 'exam' | 'general';
  examStartMin?: number;
  reason: string;
}

export interface UnservedStudent {
  pingId: string;
  alias: string;
  examStartMin?: number;
  reason: string;
}

export type ExamStudentState = 'on_time' | 'at_risk' | 'missed' | 'unassigned';

export interface ExamStudentStatus {
  pingId: string;
  alias: string;
  villageId: string;
  destinationCollegeId: string;
  examStartMin: number;
  minutesUntilExam: number;
  status: ExamStudentState;
  etaMinutes?: number;
  slackMinutes?: number;
  vehicleLabel?: string;
  reason: string;
}

export interface CrisisComparisonSide {
  examStudentsOnTime: number;
  examStudentsTotal: number;
  totalServed: number;
  studentsUnserved: number;
  totalDemand: number;
}

export interface BusRouteImpact {
  routeId: string;
  routeCode: string;
  waitingStudents: number;
  availableSeatsBefore: number;
  availableSeatsAfter: number;
  riskBefore: number;
  riskAfter: number;
  currentRunPreserved: boolean;
  studentsLeftWithoutSeats: number;
  createsCriticalShortage: boolean;
  note: string;
}

export interface BusReliefMove {
  busId: string;
  busLabel: string;
  seats: number;
  fromRouteId: string;
  fromRouteCode: string;
  toRouteId: string;
  toRouteCode: string;
  /** Simulated minutes the bus needs to finish its current duty. */
  readinessMinutes: number;
  /** Simulated minutes from its current position to the target corridor. */
  repositionMinutes: number;
  sourceImpact: BusRouteImpact;
  reason: string;
}

export interface CrisisAnalysis {
  active: boolean;
  totalDemand: number;
  seatSupply: number;
  seatShortage: number;
  comparison: {
    noAction: CrisisComparisonSide;
    gramRoute: CrisisComparisonSide;
  };
  examStudents: ExamStudentStatus[];
  unserved: UnservedStudent[];
  busMoves: BusReliefMove[];
}

export interface AllocationBreakdown {
  cost: number;
  eta: number;
  reliability: number;
  detour: number;
  seatFit: number;
  verification: number;
}

export interface AIAllocationPlan {
  id: string;
  clusterId: string;
  villageId: string;
  destinationCollegeId: string;
  vehicleIds: string[];
  studentsCovered: number;
  totalCost: number;
  costPerStudent: number;
  soloFareComparison: number;
  etaMinutes: number;
  detourKm: number;
  verificationTier: VerificationTier;
  confidence: number;
  feasibilityStatus: FeasibilityStatus;
  score: number;
  reasoning: string[];
  breakdown: AllocationBreakdown;
  generatedAt: number;
  /** Alternate pickup when the village is cut off from its destination. */
  pickupVillageId?: string;
  pickupNote?: string;
  routeId?: string;
  /** Existing route whose bus is operating this relief run. */
  sourceRouteId?: string;
  sourceRouteCode?: string;
  sourceRouteImpact?: string;
  readinessMinutes?: number;
  examStudentCount?: number;
  onTimeExamCount?: number;
  examOutlooks?: ExamOutlook[];
  studentRanks?: StudentPriority[];
  unservedStudents?: UnservedStudent[];
}

export interface RouteReallocationPlan {
  id: string;
  kind: ReallocationKind;
  routeId: string;
  title: string;
  description: string;
  capacityBefore: number;
  capacityAfter: number;
  demand: number;
  riskBefore: number;
  riskAfter: number;
  reasoning: string[];
}

export interface DispatchConsent {
  required: boolean;
  status: ConsentStatus;
  otp: string;
  confirmedAt?: number;
}

export interface Dispatch {
  id: string;
  planId: string;
  clusterId: string;
  pingIds: string[];
  vehicleIds: string[];
  studentCount: number;
  destinationCollegeId: string;
  villageId: string;
  status: DispatchStatus;
  createdAt: number;
  updatedAt: number;
  etaMinutes: number;
  etaRemaining: number;
  costPerStudent: number;
  totalCost: number;
  estimatedSavings: number;
  safetyCode: string;
  consent: DispatchConsent;
  seatsReserved: boolean;
  seatsReleased: boolean;
  impactApplied: boolean;
  history: DecisionLogEntry[];
  cancellationReason?: string;
  completedAt?: number;
  routeId?: string;
  pickupVillageId?: string;
  examOutlooks?: ExamOutlook[];
  studentRanks?: StudentPriority[];
  unservedStudents?: UnservedStudent[];
  /** One-time route occupancy adjustment applied on approval. */
  routeOccupancyApplied?: boolean;
  routeOccupancyDelta?: number;
}

export interface DecisionLogEntry {
  id: string;
  at: number;
  kind: LogKind;
  message: string;
  actor: 'system' | 'student' | 'guardian' | 'coordinator' | 'driver';
}

export interface ForecastPoint {
  label: string;
  predicted: number;
  lower: number;
  upper: number;
  seasonalFactor: number;
  confidence: number;
}

export interface ForecastResult {
  villageId: string;
  generatedAt: number;
  alpha: number;
  simulated: true;
  baseline: number;
  points: ForecastPoint[];
  historical: { label: string; value: number }[];
}

export interface BacktestDay {
  day: number;
  demand: number;
  disruption: string;
  staticStranded: number;
  gramStranded: number;
  staticWaitMinutes: number;
  gramWaitMinutes: number;
}

export interface BacktestResult {
  days: number;
  seed: number;
  simulated: true;
  staticSchedule: {
    strandedTrips: number;
    avgWaitMinutes: number;
    vehicleUtilization: number;
  };
  gramRoute: {
    strandedTrips: number;
    avgWaitMinutes: number;
    vehicleUtilization: number;
  };
  strandedTripsPrevented: number;
  waitMinutesSaved: number;
  estimatedCostSavings: number;
  daily: BacktestDay[];
  summary: string;
}

export interface ImpactMetrics {
  studentsRescued: number;
  rupeesSaved: number;
  waitingMinutesSaved: number;
  tripsCompleted: number;
  vehicleUtilization: number;
  projectedStudents: number;
  projectedRupees: number;
}

export interface ScenarioConfig {
  id: string;
  name: string;
  description: string;
  seed: number;
  monsoon: boolean;
  examDay: boolean;
  santheDay: boolean;
  festival: boolean;
  closedEdgeIds: string[];
  /** Edges closed specifically by flooding (still removed from routing). */
  floodedEdgeIds?: string[];
  cancelledRouteIds: string[];
  breakdownRouteIds: string[];
  /** Existing government buses reassigned as exam-day relief. */
  reliefBusIds?: string[];
  /** Scenario-specific seeded occupancy for a route. */
  routeOccupancyOverrides?: Record<string, number>;
  demandMultiplier: number;
  simulatedTime: number;
}

export interface WhatIfProposal {
  kind: ReallocationKind;
  routeId: string;
  label: string;
}

export interface WhatIfResult {
  routeId: string;
  kind: ReallocationKind;
  capacityBefore: number;
  capacityAfter: number;
  demand: number;
  riskBefore: number;
  riskAfter: number;
  seatsAdded: number;
  reasoning: string[];
  simulated: true;
}

export interface DemoState {
  active: boolean;
  step: number;
  totalSteps: number;
  playing: boolean;
}

export interface MobilityState {
  version: number;
  seed: number;
  scenarioId: string;
  simMinutes: number;
  clockRunning: boolean;
  monsoon: boolean;
  examDay: boolean;
  santheDay: boolean;
  festival: boolean;
  demandMultiplier: number;
  language: Language;
  view: 'student' | 'coordinator';
  stops: VillageStop[];
  colleges: College[];
  edges: RoadEdge[];
  busRoutes: BusRoute[];
  buses: GovernmentBus[];
  pings: StudentPing[];
  clusters: StudentCluster[];
  vehicles: CommunityVehicle[];
  plans: AIAllocationPlan[];
  reallocations: RouteReallocationPlan[];
  dispatches: Dispatch[];
  decisionLog: DecisionLogEntry[];
  impact: ImpactMetrics;
  demo: DemoState;
  appliedActionIds: string[];
  lastTickDemand: Record<string, number>;
  studentProfile: {
    alias: string;
    name: string;
    villageId: string;
    collegeId: string;
    isMinor: boolean;
    guardianLabel: string;
  };
}

export interface PersistenceEnvelope {
  version: number;
  savedAt: string;
  state: MobilityState;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
