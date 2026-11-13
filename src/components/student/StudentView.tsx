import { useState } from 'react';
import type { Dispatch } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BusFront,
  CheckCircle2,
  Clock,
  GraduationCap,
  MapPinned,
  ShieldCheck,
  Smartphone,
  UserRound,
  Users,
} from 'lucide-react';
import type { MobilityState } from '../../types/mobility';
import { actionCreators, type MobilityAction } from '../../state/actions';
import { formatClock } from '../../utils/formatters';
import { examSlackMinutes, isExamOnTime } from '../../services/examPolicy';
import { CorridorMap } from '../map/CorridorMap';
import { SmsSimulator } from '../sms/SmsSimulator';
import { PlanCard } from './PlanCard';
import { GuardianConsent } from './GuardianConsent';

interface StudentViewProps {
  state: MobilityState;
  dispatch: Dispatch<MobilityAction>;
  t: (key: string) => string;
}

const TRIP_STEPS = ['matched', 'guardian_consented', 'approved', 'dispatched', 'completed'] as const;

export function StudentView({ state, dispatch, t }: StudentViewProps) {
  const profile = state.studentProfile;
  const [villageId, setVillageId] = useState(profile.villageId);
  const [collegeId, setCollegeId] = useState(profile.collegeId);
  const [requested, setRequested] = useState(false);

  const village = state.stops.find((stop) => stop.id === villageId);
  const college = state.colleges.find((candidate) => candidate.id === collegeId);
  const route = state.busRoutes.find(
    (candidate) =>
      candidate.stopIds.includes(villageId) && candidate.destinationCollegeId === collegeId,
  );
  const activePings = state.pings.filter(
    (ping) =>
      ping.villageId === villageId &&
      ping.destinationCollegeId === collegeId &&
      (ping.status === 'waiting' || ping.status === 'clustered' || ping.status === 'matched' || ping.status === 'reserved'),
  );
  const myPing = activePings.find(
    (ping) => ping.studentAlias === profile.alias && (ping.status === 'waiting' || ping.status === 'clustered'),
  );
  const cluster = state.clusters.find(
    (candidate) => candidate.villageId === villageId && candidate.destinationCollegeId === collegeId,
  );
  const plans = state.plans.filter(
    (plan) =>
      plan.villageId === villageId &&
      plan.destinationCollegeId === collegeId &&
      plan.feasibilityStatus !== 'infeasible',
  );
  const latestTrip = [...state.dispatches]
    .filter(
      (trip) =>
        trip.villageId === villageId &&
        trip.destinationCollegeId === collegeId &&
        trip.status !== 'cancelled',
    )
    .sort((a, b) => b.createdAt - a.createdAt)[0];

  const myExamPing = state.pings.find(
    (ping) =>
      ping.studentAlias === profile.alias &&
      ping.villageId === villageId &&
      ping.destinationCollegeId === collegeId &&
      ping.examStartMin !== undefined &&
      ping.status !== 'expired' &&
      ping.status !== 'cancelled',
  );
  const myExamPlan = plans.find((plan) =>
    plan.examOutlooks?.some((outlook) => outlook.pingId === myExamPing?.id),
  );
  const myExamTrip = latestTrip?.examOutlooks?.some(
    (outlook) => outlook.pingId === myExamPing?.id,
  )
    ? latestTrip
    : undefined;
  const myExamOutlook =
    myExamPlan?.examOutlooks?.find((outlook) => outlook.pingId === myExamPing?.id) ??
    myExamTrip?.examOutlooks?.find((outlook) => outlook.pingId === myExamPing?.id);
  const myExamEta = myExamOutlook?.etaMinutes ?? myExamPlan?.etaMinutes ??
    (myExamTrip
      ? myExamTrip.status === 'dispatched'
        ? myExamTrip.etaRemaining
        : myExamTrip.etaMinutes
      : undefined);
  const myExamAssigned = Boolean(myExamOutlook || myExamPlan || myExamTrip);
  const myExamSlack =
    myExamPing?.examStartMin !== undefined && myExamEta !== undefined
      ? examSlackMinutes(myExamPing.examStartMin, state.simMinutes, myExamEta)
      : undefined;
  const myExamOnTime =
    myExamPing?.examStartMin !== undefined && myExamEta !== undefined
      ? isExamOnTime(myExamPing.examStartMin, state.simMinutes, myExamEta)
      : undefined;
  const myExamTone = !myExamAssigned
    ? {
        card: 'border-red-300 bg-red-50',
        badge: 'bg-red-700 text-white',
        text: 'text-red-900',
        label: 'Awaiting allocation',
      }
    : myExamOnTime === false
      ? {
          card: 'border-red-300 bg-red-50',
          badge: 'bg-red-700 text-white',
          text: 'text-red-900',
          label: 'Misses deadline',
        }
      : (myExamSlack ?? 0) < 20
        ? {
            card: 'border-amber-300 bg-amber-50',
            badge: 'bg-amber-500 text-white',
            text: 'text-amber-900',
            label: 'Tight but on time',
          }
        : {
            card: 'border-emerald-300 bg-emerald-50',
            badge: 'bg-emerald-700 text-white',
            text: 'text-emerald-900',
            label: 'On time',
          };

  const canMatch = (planClusterId: string): boolean => {
    if (!myPing) return false;
    return Boolean(cluster && planClusterId === cluster.id && cluster.pingIds.includes(myPing.id));
  };

  const requestRide = (): void => {
    dispatch(actionCreators.requestPing(villageId, collegeId, 'app', profile.alias, 'Student app request'));
    setRequested(true);
  };

  const reportBus = (): void => {
    if (!route) return;
    dispatch(
      actionCreators.reportBusIssue(route.id, route.status === 'running' ? 'full' : 'breakdown'),
    );
  };

  const proxyPing = (): void => {
    dispatch(
      actionCreators.requestPing(
        villageId,
        collegeId,
        'proxy',
        undefined,
        'Proxy ping raised by teacher / village coordinator',
      ),
    );
  };

  const isMeenaLocation = villageId === profile.villageId && collegeId === profile.collegeId;
  const currentTrip = latestTrip;
  const currentStepIndex = currentTrip
    ? TRIP_STEPS.indexOf(currentTrip.status as (typeof TRIP_STEPS)[number])
    : -1;

  return (
    <div className="mx-auto grid max-w-[1440px] gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-6">
      <div className="space-y-4">
        <section className="card overflow-hidden">
          <div className="bg-gradient-to-r from-forest-900 via-forest-800 to-forest-700 px-4 py-5 text-white sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-forest-200">
                  <Smartphone size={14} aria-hidden="true" /> {t('view.student')} · {t('student.demoPersona')}
                </div>
                <h1 className="mt-1 font-display text-2xl font-black tracking-tight sm:text-3xl">
                  {t('student.title')}
                </h1>
                <p className="mt-1 text-sm text-forest-100">{t('student.subtitle')}</p>
              </div>
              <div className="rounded-2xl border border-white/20 bg-white/10 p-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-clay-300 text-forest-950">
                    <UserRound size={19} aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-sm font-bold">
                      Meena <span className="text-forest-200">· {profile.alias}</span>
                    </div>
                    <div className="text-[11px] text-forest-200">
                      {village?.name} → {college?.shortName}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            <label className="block">
              <span className="label flex items-center gap-1.5">
                <MapPinned size={13} aria-hidden="true" /> {t('student.village')}
              </span>
              <select className="field" value={villageId} onChange={(event) => setVillageId(event.target.value)}>
                {state.stops.map((stop) => (
                  <option key={stop.id} value={stop.id}>
                    {stop.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label flex items-center gap-1.5">
                <GraduationCap size={13} aria-hidden="true" /> {t('student.destination')}
              </span>
              <select className="field" value={collegeId} onChange={(event) => setCollegeId(event.target.value)}>
                {state.colleges.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!isMeenaLocation ? (
            <div className="mx-4 mb-4 rounded-xl border border-clay-200 bg-clay-50 p-3 text-xs text-clay-900 sm:mx-5">
              Demo persona Meena is registered from Adyar to Sahyadri FGC. You are viewing another
              corridor; any request will still be submitted for this village and college.
            </div>
          ) : null}
        </section>

        {myExamPing ? (
          <section
            className={`card border-2 p-4 sm:p-5 ${myExamTone.card}`}
            aria-labelledby="exam-priority-heading"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${myExamTone.badge}`}
                >
                  <GraduationCap size={13} aria-hidden="true" /> Exam priority
                </span>
                <h2 id="exam-priority-heading" className={`mt-2 font-display text-lg font-black ${myExamTone.text}`}>
                  Exam at {formatClock(myExamPing.examStartMin as number)}
                </h2>
                <p className={`text-xs font-semibold ${myExamTone.text}`}>
                  {Math.max(0, (myExamPing.examStartMin as number) - state.simMinutes)} min until the exam ·{' '}
                  {myExamTone.label}
                </p>
              </div>
              <div className="rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-right">
                <div className="text-[10px] font-bold uppercase tracking-wide text-forest-500">
                  Time slack
                </div>
                <div className={`font-display text-2xl font-black tabular-nums ${myExamTone.text}`}>
                  {typeof myExamSlack === 'number'
                    ? `${myExamSlack >= 0 ? '+' : ''}${myExamSlack} min`
                    : '—'}
                </div>
                <div className="text-[10px] text-forest-500">after 15-min buffer</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-white/75 p-2">
                <div className="text-[10px] uppercase text-forest-500">Vehicle</div>
                <div className="font-bold text-forest-900">
                  {myExamTrip
                    ? state.vehicles.find((vehicle) => myExamTrip.vehicleIds.includes(vehicle.id))?.label
                    : myExamPlan
                      ? state.vehicles.find((vehicle) => myExamPlan.vehicleIds.includes(vehicle.id))?.label
                      : 'Not assigned'}
                </div>
              </div>
              <div className="rounded-lg bg-white/75 p-2">
                <div className="text-[10px] uppercase text-forest-500">Vehicle ETA</div>
                <div className="font-bold tabular-nums text-forest-900">
                  {myExamEta !== undefined ? `${myExamEta} min` : '—'}
                </div>
              </div>
              <div className="rounded-lg bg-white/75 p-2">
                <div className="text-[10px] uppercase text-forest-500">Arrival buffer</div>
                <div className="font-bold tabular-nums text-forest-900">15 min</div>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-forest-700">
              {myExamOutlook?.reason ??
                (myExamAssigned
                  ? `Exam students are ranked before students without exams. On time only if ETA + 15 minutes is at or before ${formatClock(myExamPing.examStartMin as number)}.`
                  : 'No feasible vehicle is assigned yet. The coordinator has this student on the exam-priority unserved list.')}
            </p>
            {myExamOnTime === false && typeof myExamSlack === 'number' ? (
              <p className="mt-1 rounded-lg bg-white/80 p-2 text-[11px] font-semibold text-red-800">
                This deadline cannot be met: the assigned ETA plus the 15-minute arrival buffer is{' '}
                {Math.abs(myExamSlack)} min after the exam starts. Ask the coordinator to hold the
                exam or move you to an earlier vehicle; the app will not claim an on-time arrival.
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="card p-4 sm:p-5" aria-labelledby="bus-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="bus-heading" className="panel-title flex items-center gap-2">
                <BusFront size={17} className="text-forest-600" aria-hidden="true" />
                {t('student.bus')}
              </h2>
              <p className="mt-0.5 text-xs text-forest-600">
                {route ? `Route ${route.code} · ${route.name}` : 'No direct government route serves this pair.'}
              </p>
            </div>
            {route ? (
              <span
                className={`chip ${
                  route.status === 'running'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {route.status}
              </span>
            ) : null}
          </div>

          {route ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl bg-forest-50 p-3">
                  <div className="stat-label">Capacity</div>
                  <div className="stat-value">
                    {route.occupancy}/{route.capacity}
                  </div>
                </div>
                <div className="rounded-xl bg-forest-50 p-3">
                  <div className="stat-label">{t('student.seats')}</div>
                  <div className="stat-value text-clay-700">
                    {Math.max(0, route.capacity - route.occupancy)}
                  </div>
                </div>
                <div className="rounded-xl bg-forest-50 p-3">
                  <div className="stat-label">Departure</div>
                  <div className="stat-value">{route.minutesToDeparture} min</div>
                </div>
                <div className="rounded-xl bg-forest-50 p-3">
                  <div className="stat-label">At stop</div>
                  <div className="stat-value text-base">
                    {cluster ? `${cluster.studentCount} waiting` : `${activePings.length} waiting`}
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] font-semibold text-forest-700">
                  <span>Bus occupancy</span>
                  <span>{Math.round((route.occupancy / route.capacity) * 100)}%</span>
                </div>
                <div
                  className="mt-1 h-2.5 overflow-hidden rounded-full bg-forest-100"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={route.capacity}
                  aria-valuenow={route.occupancy}
                  aria-label="Government bus occupancy"
                >
                  <div
                    className={`h-full rounded-full ${
                      route.occupancy >= route.capacity ? 'bg-red-500' : route.occupancy / route.capacity > 0.85 ? 'bg-clay-500' : 'bg-forest-500'
                    }`}
                    style={{ width: `${Math.min(100, (route.occupancy / route.capacity) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="mt-3 hidden gap-1.5 lg:flex">
                {[...route.stopIds, route.destinationCollegeId].map((stopId, index) => {
                  const stop = state.stops.find((candidate) => candidate.id === stopId);
                  const destination = state.colleges.find((candidate) => candidate.id === stopId);
                  return (
                    <span key={`${route.id}-${stopId}`} className="flex items-center gap-1 text-[11px] text-forest-700">
                      {index > 0 ? <ArrowRight size={11} aria-hidden="true" /> : null}
                      <span className={stopId === villageId ? 'font-bold text-forest-950' : ''}>
                        {stop?.name ?? destination?.shortName}
                      </span>
                    </span>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              No government route connects {village?.name} to {college?.shortName}. Request a shared
              community vehicle below.
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={requestRide}
              disabled={Boolean(myPing) || Boolean(latestTrip && latestTrip.status !== 'completed' && latestTrip.status !== 'cancelled')}
            >
              <Users size={15} aria-hidden="true" />
              {myPing ? 'Ride requested' : t('student.request')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={reportBus}
              disabled={!route || route.status !== 'running'}
              title="Reports the selected government route full so the optimizer can cluster stranded students"
            >
              <AlertTriangle size={15} className="text-amber-600" aria-hidden="true" />
              {t('student.reportFull')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={proxyPing}
              title="A teacher or village coordinator can raise a ping on a student's behalf"
            >
              <ShieldCheck size={15} className="text-forest-600" aria-hidden="true" />
              {t('student.proxy')}
            </button>
          </div>
          {requested && myPing ? (
            <p className="mt-2 text-xs font-semibold text-forest-700" role="status">
              {t('student.requestsent')} Ping expires after 20 simulated minutes.
            </p>
          ) : null}
        </section>

        {currentTrip ? (
          <section className="card border-forest-300 p-4 sm:p-5" aria-labelledby="trip-heading">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 id="trip-heading" className="panel-title">
                  Your shared trip
                </h2>
                <p className="text-xs text-forest-600">
                  {currentTrip.villageId} → {state.colleges.find((c) => c.id === currentTrip.destinationCollegeId)?.shortName} ·{' '}
                  {currentTrip.studentCount} students
                </p>
              </div>
              <span className="chip bg-forest-100 text-forest-800">{currentTrip.status.replace('_', ' ')}</span>
            </div>

            <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Dispatch lifecycle">
              {TRIP_STEPS.map((step, index) => {
                const done = currentStepIndex >= index;
                return (
                  <li
                    key={step}
                    className={`rounded-xl border p-2 text-center ${
                      done ? 'border-forest-300 bg-forest-50' : 'border-forest-100 bg-white'
                    }`}
                  >
                    <CheckCircle2
                      size={15}
                      className={`mx-auto ${done ? 'text-forest-600' : 'text-forest-200'}`}
                      aria-hidden="true"
                    />
                    <div className={`mt-1 text-[10px] font-bold uppercase ${done ? 'text-forest-800' : 'text-forest-400'}`}>
                      {step.replace('_', ' ')}
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-forest-50 p-3">
                <div className="stat-label">{t('student.safetyCode')}</div>
                <div className="mt-0.5 font-mono text-xl font-black tracking-[0.2em]">
                  {currentTrip.safetyCode}
                </div>
              </div>
              <div className="rounded-xl bg-forest-50 p-3">
                <div className="stat-label">
                  {currentTrip.status === 'dispatched' ? 'Arriving in' : 'Share fare'}
                </div>
                <div className="mt-0.5 text-xl font-black tabular-nums">
                  {currentTrip.status === 'dispatched' ? `${currentTrip.etaRemaining} min` : `₹${currentTrip.costPerStudent}`}
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-forest-100 p-3">
                <div className="stat-label flex items-center gap-1">
                  <MapPinned size={12} aria-hidden="true" /> {t('student.pickup')}
                </div>
                <div className="text-sm font-semibold">
                  {state.stops.find(
                    (stop) => stop.id === (currentTrip.pickupVillageId ?? currentTrip.villageId),
                  )?.name}
                </div>
                {currentTrip.pickupVillageId && currentTrip.pickupVillageId !== currentTrip.villageId ? (
                  <div className="text-[11px] font-semibold text-amber-800">
                    Alternate pickup: the direct road from {village?.name} is flooded. Wait at the
                    nearest reachable point above; the ETA includes your walk.
                  </div>
                ) : null}
                <div className="text-[11px] text-forest-600">
                  {state.vehicles.find((v) => currentTrip.vehicleIds.includes(v.id))?.label} ·{' '}
                  {state.vehicles.find((v) => currentTrip.vehicleIds.includes(v.id))?.driverName}
                </div>
              </div>
              <div className="rounded-xl border border-forest-100 p-3">
                <div className="stat-label flex items-center gap-1">
                  <GraduationCap size={12} aria-hidden="true" /> {t('student.dropoff')}
                </div>
                <div className="text-sm font-semibold">{college?.shortName}</div>
                <div className="text-[11px] text-forest-600">Verified drop-off point</div>
              </div>
            </div>

            {currentTrip.status === 'completed' ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
                <CheckCircle2 size={16} aria-hidden="true" /> Trip completed. Impact panel updated.
              </div>
            ) : currentTrip.status === 'approved' ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                <Clock size={16} aria-hidden="true" /> Approved. Waiting for the driver to start the trip.
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="card p-4 sm:p-5" aria-labelledby="alternatives-heading">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="alternatives-heading" className="panel-title">
                {t('student.alternatives')}
              </h2>
              <p className="text-xs text-forest-600">
                Capacity-constrained, deterministic matches. Explanations come directly from the optimizer.
              </p>
            </div>
            {cluster ? (
              <span className="chip bg-clay-100 text-clay-800">
                <Users size={12} aria-hidden="true" /> Cluster of {cluster.studentCount}
              </span>
            ) : null}
          </div>

          <div className="mt-3 space-y-3">
            {plans.length === 0 ? (
              <div className="rounded-xl border border-dashed border-forest-200 bg-forest-50/60 p-4 text-sm text-forest-700">
                {t('student.noPlans')}
              </div>
            ) : (
              plans.slice(0, 3).map((plan, index) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  state={state}
                  canMatch={canMatch(plan.clusterId)}
                  highlight={index === 0}
                  onMatch={() => dispatch(actionCreators.matchPlan(plan.id))}
                />
              ))
            )}
          </div>
        </section>

        <div className="hidden lg:block">
          <CorridorMap state={state} focusVillageId={villageId} focusCollegeId={collegeId} compact />
        </div>

        <div className="card p-4 lg:hidden">
          <h2 className="panel-title">{route ? `Route ${route.code} stops` : 'Corridor stops'}</h2>
          <ul className="mt-2 space-y-2">
            {state.stops.map((stop) => {
              const count = state.pings.filter(
                (ping) => ping.villageId === stop.id && (ping.status === 'waiting' || ping.status === 'clustered'),
              ).length;
              return (
                <li key={stop.id} className="flex items-center justify-between gap-2 rounded-xl border border-forest-100 px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold">{stop.name}</div>
                    <div className="text-[11px] text-forest-600">
                      {count} waiting · {stop.population.toLocaleString('en-IN')} residents
                    </div>
                  </div>
                  <span
                    className={`chip ${
                      count >= 3 ? 'bg-clay-100 text-clay-800' : 'bg-forest-100 text-forest-700'
                    }`}
                  >
                    {count >= 3 ? 'cluster' : count > 0 ? 'demand' : 'clear'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <aside className="space-y-4">
        {currentTrip ? (
          <GuardianConsent state={state} dispatch={dispatch} trip={currentTrip} t={t} />
        ) : (
          <section className="card p-4">
            <h2 className="panel-title">{t('student.consent')}</h2>
            <p className="mt-1 text-xs leading-relaxed text-forest-600">
              Guardian consent is required before any dispatch. Request a ride and choose an
              alternative to generate the simulated OTP and Trip Safety Code.
            </p>
            <div className="mt-3 rounded-xl border border-forest-100 bg-forest-50 p-3 text-xs text-forest-700">
              <div className="flex items-center gap-2 font-semibold text-forest-900">
                <ShieldCheck size={15} aria-hidden="true" /> Consent gate enforced
              </div>
              <p className="mt-1">
                A matched dispatch cannot be approved by the coordinator until guardian consent is
                confirmed. Cancelling before dispatch releases the reserved seats.
              </p>
            </div>
          </section>
        )}

        <SmsSimulator state={state} dispatch={dispatch} t={t} compact />

        <section className="card p-4">
          <h2 className="panel-title">Trip status</h2>
          <dl className="mt-2 space-y-2 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-forest-600">Simulated clock</dt>
              <dd className="font-bold tabular-nums">{formatClock(state.simMinutes)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-forest-600">Your ping</dt>
              <dd className="font-semibold">
                {myPing ? myPing.status : latestTrip ? latestTrip.status : 'not sent'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-forest-600">Nearby students</dt>
              <dd className="font-semibold">{activePings.length}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-forest-600">Clock running</dt>
              <dd className="font-semibold">{state.clockRunning ? 'yes' : 'paused'}</dd>
            </div>
          </dl>
        </section>
      </aside>
    </div>
  );
}
