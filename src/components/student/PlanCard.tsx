import { CheckCircle2, Clock, GraduationCap, IndianRupee, Route, ShieldCheck, Users } from 'lucide-react';
import type { AIAllocationPlan, MobilityState } from '../../types/mobility';
import { formatCurrency } from '../../utils/formatters';

interface PlanCardProps {
  plan: AIAllocationPlan;
  state: MobilityState;
  canMatch: boolean;
  onMatch: () => void;
  highlight?: boolean;
  compact?: boolean;
}

export function PlanCard({ plan, state, canMatch, onMatch, highlight, compact }: PlanCardProps) {
  const vehicle = state.vehicles.find((candidate) => candidate.id === plan.vehicleIds[0]);
  const village = state.stops.find((stop) => stop.id === plan.villageId);
  const feasible = plan.feasibilityStatus !== 'infeasible';

  return (
    <article
      className={`rounded-2xl border p-4 ${
        highlight ? 'border-forest-400 bg-forest-50/70 ring-1 ring-forest-200' : 'border-forest-100 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-forest-950">{vehicle?.label ?? 'No vehicle available'}</h3>
            {vehicle ? (
              <span className="chip bg-forest-100 text-forest-800">{vehicle.kind.replace('-', ' ')}</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-forest-600">
            {village?.name} → {state.colleges.find((college) => college.id === plan.destinationCollegeId)?.shortName} ·{' '}
            {plan.studentsCovered} {plan.studentsCovered === 1 ? 'student' : 'students'} in cluster
          </p>
          {plan.pickupVillageId && plan.pickupVillageId !== plan.villageId ? (
            <p className="mt-1 text-[11px] font-semibold text-amber-800">
              Village cut off · nearest reachable pickup:{' '}
              {state.stops.find((stop) => stop.id === plan.pickupVillageId)?.name}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <div className="text-lg font-black tabular-nums text-forest-950">
            {formatCurrency(plan.costPerStudent)}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-forest-500">
            per student
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl bg-forest-50 p-2">
          <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-forest-600">
            <Clock size={12} aria-hidden="true" /> ETA
          </div>
          <div className="mt-0.5 text-sm font-bold tabular-nums">{plan.etaMinutes} min</div>
        </div>
        <div className="rounded-xl bg-forest-50 p-2">
          <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-forest-600">
            <Route size={12} aria-hidden="true" /> Detour
          </div>
          <div className="mt-0.5 text-sm font-bold tabular-nums">{plan.detourKm.toFixed(1)} km</div>
        </div>
        <div className="rounded-xl bg-forest-50 p-2">
          <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-forest-600">
            <Users size={12} aria-hidden="true" /> Seats
          </div>
          <div className="mt-0.5 text-sm font-bold tabular-nums">
            {plan.studentsCovered}/{vehicle?.seats ?? plan.studentsCovered}
          </div>
        </div>
        <div className="rounded-xl bg-forest-50 p-2">
          <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-forest-600">
            <IndianRupee size={12} aria-hidden="true" /> Solo auto
          </div>
          <div className="mt-0.5 text-sm font-bold tabular-nums">{formatCurrency(plan.soloFareComparison)}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="chip bg-forest-100 text-forest-800">
          <ShieldCheck size={11} aria-hidden="true" /> {plan.verificationTier}
        </span>
        <span className="chip bg-clay-100 text-clay-800">
          Score {(plan.score * 100).toFixed(0)}%
        </span>
        {plan.sourceRouteCode ? (
          <span className="chip bg-forest-100 text-forest-800">
            <Route size={11} aria-hidden="true" /> Relief from Route {plan.sourceRouteCode}
            {plan.readinessMinutes ? ` · ${plan.readinessMinutes} min readiness` : ''}
          </span>
        ) : null}
        {plan.examStudentCount ? (
          <span className="chip bg-amber-100 text-amber-900">
            <GraduationCap size={11} aria-hidden="true" /> Exam priority ·{' '}
            {plan.onTimeExamCount ?? 0}/{plan.examStudentCount} on time
          </span>
        ) : null}
        <span
          className={`chip ${
            plan.feasibilityStatus === 'feasible'
              ? 'bg-emerald-100 text-emerald-800'
              : plan.feasibilityStatus === 'degraded'
                ? 'bg-amber-100 text-amber-900'
                : 'bg-red-100 text-red-800'
          }`}
        >
          {plan.feasibilityStatus}
        </span>
        {plan.confidence > 0 ? (
          <span className="text-[11px] font-medium text-forest-600">
            confidence {Math.round(plan.confidence * 100)}%
          </span>
        ) : null}
      </div>

      {!compact ? (
        <details className="mt-3 rounded-xl border border-forest-100 bg-white/70 p-3" open={highlight}>
          <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-wide text-forest-800">
            Why this option
          </summary>
          <ul className="mt-2 space-y-1.5">
            {plan.reasoning.map((reason, index) => (
              <li key={`${plan.id}-reason-${index}`} className="flex gap-1.5 text-xs leading-relaxed text-forest-800">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-forest-500" aria-hidden="true" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {feasible ? (
        <button
          type="button"
          className="btn btn-primary mt-3 w-full"
          disabled={!canMatch}
          onClick={onMatch}
          title={
            canMatch
              ? 'Reserve seats and request guardian consent'
              : 'Request a shared ride first, then choose this vehicle'
          }
        >
          {canMatch ? 'Choose this ride' : 'Request a ride to join this cluster'}
        </button>
      ) : null}
    </article>
  );
}
