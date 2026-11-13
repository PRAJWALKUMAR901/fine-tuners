import { it } from 'vitest';
import { createRuntimeState } from '../src/state/mobilityReducer';
import { evaluateExamCrisis } from '../src/services/crisisPlanner';

it('inspect', () => {
  const s = createRuntimeState('exam-crisis');
  const a = evaluateExamCrisis(s, s.simMinutes);
  console.log('demand', a.totalDemand, 'seats', a.seatSupply, 'short', a.seatShortage);
  console.log('comparison', a.comparison);
  console.log('exam', a.examStudents.map((e) => [e.alias, e.status, e.etaMinutes, e.slackMinutes]));
  console.log('moves', a.busMoves.map((m) => [m.fromRouteCode, m.toRouteCode, m.readinessMinutes, m.repositionMinutes, m.sourceImpact]));
  console.log('plans', s.plans.map((p) => [p.villageId, p.destinationCollegeId, p.vehicleIds[0], p.studentsCovered, p.etaMinutes, p.onTimeExamCount, p.examStudentCount, p.pickupVillageId]));
  console.log('unserved', a.unserved.length, a.unserved.slice(0, 5));
});
