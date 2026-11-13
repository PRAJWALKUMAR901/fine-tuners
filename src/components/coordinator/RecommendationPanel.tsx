import type { Dispatch } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CircleSlash,
  Clock,
  GraduationCap,
  MapPin,
  Play,
  Route,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import type { MobilityState } from '../../types/mobility';
import { actionCreators, type MobilityAction } from '../../state/actions';
import { formatCurrency, formatClock } from '../../utils/formatters';

interface RecommendationPanelProps {
  state: MobilityState;
  dispatch: Dispatch<MobilityAction>;
  t: (key: string) => string;
}

export function RecommendationPanel({ state, dispatch, t }: RecommendationPanelProps) {
  const openClusters = state.clusters.filter(
    (cluster) =>
      !state.dispatches.some(
        (trip) => trip.clusterId === cluster.id && trip.status !== 'cancelled',
      ),
  );
  const openPlans = state.plans.filter((plan) =>
    openClusters.some((cluster) => cluster.id === plan.clusterId),
  );
  const activeDispatches = state.dispatches
    .filter((trip) => trip.status !== 'cancelled')
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <section className="card p-4" aria-labelledby="recommendations-heading">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="recommendations-heading" className="panel-title">
            {t('coordinator.recommendations')}
          </h2>
          <p className="text-xs text-forest-600">
            Exhaustive cluster-to-vehicle allocation. Coverage first, then weighted score.
          </p>
        </div>
        <span className="chip bg-forest-100 text-forest-800">{openPlans.length} open</span>
      </div>

      <div className="mt-3 space-y-3">
        {openPlans.length === 0 ? (
          <div className="rounded-xl border border-dashed border-forest-200 bg-forest-50/60 p-4 text-sm text-forest-600">
            No open cluster currently needs allocation. Start the clock, request a ping, or trigger a
            disruption.
          </div>
        ) : (
          openPlans.map((plan, index) => {
            const cluster = openClusters.find((candidate) => candidate.id === plan.clusterId);
            const vehicle = state.vehicles.find((candidate) => candidate.id === plan.vehicleIds[0]);
            const village = state.stops.find((stop) => stop.id === plan.villageId);
            return (
              <article
                key={plan.id}
                className={`rounded-2xl border p-3 ${
                  plan.feasibilityStatus === 'infeasible'
                    ? 'border-red-200 bg-red-50/50'
                    : index === 0
                      ? 'border-forest-300 bg-forest-50/60'
                      : 'border-forest-100 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest-800 text-[10px] font-black text-white">
                      {index + 1}
                    </span>
                    <div>
                      <div className="text-sm font-bold text-forest-950">
                        {vehicle?.label ?? 'Unserved cluster'}{' '}
                        <span className="font-medium text-forest-600">
                          · {village?.name} →{' '}
                          {state.colleges.find((college) => college.id === plan.destinationCollegeId)?.shortName}
                        </span>
                      </div>
                      <div className="text-[11px] text-forest-600">
                        {plan.studentsCovered} students · {formatCurrency(plan.costPerStudent)} each ·{' '}
                        {plan.etaMinutes} min · {plan.detourKm.toFixed(1)} km detour
                      </div>
                      {plan.pickupVillageId && plan.pickupVillageId !== plan.villageId ? (
                        <div className="text-[10px] font-semibold text-amber-800">
                          Cut off · pickup at{' '}
                          {state.stops.find((stop) => stop.id === plan.pickupVillageId)?.name}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black tabular-nums text-forest-900">
                      {(plan.score * 100).toFixed(0)}
                    </div>
                    <div className="text-[9px] font-bold uppercase text-forest-500">score</div>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="chip bg-white text-forest-700 ring-1 ring-forest-200">
                    <ShieldCheck size={11} aria-hidden="true" /> {plan.verificationTier}
                  </span>
                  <span className="chip bg-white text-forest-700 ring-1 ring-forest-200">
                    <Users size={11} aria-hidden="true" /> {cluster?.studentCount ?? plan.studentsCovered} intact
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
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {plan.feasibilityStatus}
                  </span>
                </div>

                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-bold text-forest-700">
                    Engine explanation
                  </summary>
                  <ul className="mt-1 space-y-1 text-[11px] leading-relaxed text-forest-700">
                    {plan.reasoning.map((reason) => (
                      <li key={`${plan.id}-${reason.slice(0, 24)}`}>• {reason}</li>
                    ))}
                  </ul>
                  {plan.studentRanks?.length ? (
                    <div className="mt-2 border-t border-forest-100 pt-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-forest-600">
                        Student priority order
                      </p>
                      <ol className="mt-1 space-y-0.5 text-[10px] leading-relaxed text-forest-700">
                        {plan.studentRanks.map((student) => (
                          <li key={`${plan.id}-rank-${student.pingId}`}>
                            <span className="font-semibold">#{student.rank}</span> {student.reason}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                </details>

                {plan.feasibilityStatus !== 'infeasible' ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm mt-2 w-full"
                    onClick={() => dispatch(actionCreators.matchPlan(plan.id))}
                  >
                    Reserve seats &amp; match vehicle
                  </button>
                ) : (
                  <p className="mt-2 rounded-lg bg-red-100 px-2 py-1.5 text-[11px] font-semibold text-red-800">
                    No feasible vehicle. Human coordinator action required.
                  </p>
                )}
              </article>
            );
          })
        )}
      </div>

      <div className="mt-5 border-t border-forest-100 pt-3">
        <h3 className="card-heading">
          <Clock size={14} aria-hidden="true" /> Dispatch lifecycle
        </h3>
        {activeDispatches.length === 0 ? (
          <p className="mt-2 text-xs text-forest-600">
            No dispatches yet. Match a recommendation to begin the consent and approval workflow.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {activeDispatches.map((trip) => {
              const vehicle = state.vehicles.find((candidate) => candidate.id === trip.vehicleIds[0]);
              const village = state.stops.find((stop) => stop.id === trip.villageId);
              return (
                <article key={trip.id} className="rounded-xl border border-forest-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 text-sm font-bold text-forest-950">
                        {village?.name} <ArrowRight size={12} aria-hidden="true" />{' '}
                        {state.colleges.find((college) => college.id === trip.destinationCollegeId)?.shortName}
                      </div>
                      <div className="text-[11px] text-forest-600">
                        {vehicle?.label} · {trip.studentCount} students · {formatCurrency(trip.costPerStudent)} each ·{' '}
                        {trip.vehicleIds.join(', ')}
                      </div>
                    </div>
                    <span
                      className={`chip ${
                        trip.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : trip.status === 'dispatched'
                            ? 'bg-clay-100 text-clay-800'
                            : trip.status === 'matched'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-forest-100 text-forest-800'
                      }`}
                    >
                      {trip.status.replace('_', ' ')}
                    </span>
                  </div>

                  <dl className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
                    <div className="rounded-lg bg-forest-50 p-1.5">
                      <dt className="text-forest-500">Consent</dt>
                      <dd className="font-semibold">{trip.consent.status}</dd>
                    </div>
                    <div className="rounded-lg bg-forest-50 p-1.5">
                      <dt className="text-forest-500">Safety code</dt>
                      <dd className="font-mono font-bold">{trip.safetyCode}</dd>
                    </div>
                    <div className="rounded-lg bg-forest-50 p-1.5">
                      <dt className="text-forest-500">
                        {trip.status === 'dispatched' ? 'ETA remaining' : 'Created'}
                      </dt>
                      <dd className="font-semibold tabular-nums">
                        {trip.status === 'dispatched' ? `${trip.etaRemaining} min` : formatClock(trip.createdAt)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {trip.status === 'matched' ? (
                      <>
                        <span className="chip bg-amber-100 text-amber-900">
                          <Clock size={11} aria-hidden="true" /> Awaiting guardian consent
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => dispatch(actionCreators.setView('student'))}
                        >
                          Open Student App for consent
                        </button>
                      </>
                    ) : null}
                    {trip.status === 'guardian_consented' ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() =>
                          dispatch(actionCreators.approveDispatch(trip.id, state.version))
                        }
                      >
                        <CheckCircle2 size={13} aria-hidden="true" /> {t('coordinator.approve')}
                      </button>
                    ) : null}
                    {trip.status === 'approved' ? (
                      <button
                        type="button"
                        className="btn btn-accent btn-sm"
                        onClick={() => dispatch(actionCreators.startTrip(trip.id))}
                      >
                        <Play size={13} aria-hidden="true" /> Start trip
                      </button>
                    ) : null}
                    {trip.status === 'dispatched' ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => dispatch(actionCreators.completeTrip(trip.id))}
                      >
                        <CheckCircle2 size={13} aria-hidden="true" /> Complete trip
                      </button>
                    ) : null}
                    {trip.status === 'completed' ? (
                      <span className="chip bg-emerald-100 text-emerald-800">
                        <CheckCircle2 size={11} aria-hidden="true" /> Impact recorded
                      </span>
                    ) : null}
                    {trip.status !== 'completed' ? (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() =>
                          dispatch(
                            actionCreators.cancelDispatch(
                              trip.id,
                              'Coordinator cancelled from control center',
                            ),
                          )
                        }
                      >
                        <XCircle size={13} aria-hidden="true" /> {t('coordinator.cancel')}
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1.5 flex items-center gap-1 text-[10px] text-forest-500">
                    <MapPin size={10} aria-hidden="true" /> Dispatch {trip.id} · seats reserved:{' '}
                    {trip.seatsReserved && !trip.seatsReleased ? 'yes' : 'released'} · impact applied:{' '}
                    {trip.impactApplied ? 'yes' : 'no'}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-forest-100 bg-forest-50/70 p-2.5 text-[11px] text-forest-700">
        <CircleSlash size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          Approval re-validates latest capacity and the dispatch version. Repeated approval is
          idempotent. Cancelling before completion releases seats once and reopens student pings.
        </p>
      </div>
    </section>
  );
}
