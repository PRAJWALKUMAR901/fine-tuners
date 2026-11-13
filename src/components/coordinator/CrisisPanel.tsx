import { useMemo } from 'react';
import {
  AlertOctagon,
  BusFront,
  CheckCircle2,
  Clock,
  GraduationCap,
  Users,
  XCircle,
} from 'lucide-react';
import type { CrisisAnalysis, ExamStudentState, MobilityState } from '../../types/mobility';
import { evaluateExamCrisis } from '../../services/crisisPlanner';
import { formatClock } from '../../utils/formatters';

interface CrisisPanelProps {
  state: MobilityState;
}

const STATUS_TONE: Record<
  ExamStudentState,
  { border: string; bg: string; text: string; dot: string; label: string }
> = {
  on_time: {
    border: 'border-emerald-200',
    bg: 'bg-emerald-50',
    text: 'text-emerald-900',
    dot: 'bg-emerald-500',
    label: 'On time',
  },
  at_risk: {
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    text: 'text-amber-900',
    dot: 'bg-amber-500',
    label: 'Tight',
  },
  missed: {
    border: 'border-red-200',
    bg: 'bg-red-50',
    text: 'text-red-900',
    dot: 'bg-red-500',
    label: 'Misses deadline',
  },
  unassigned: {
    border: 'border-red-200',
    bg: 'bg-red-50',
    text: 'text-red-900',
    dot: 'bg-red-500',
    label: 'Unassigned',
  },
};

function ComparisonRow({
  analysis,
  label,
}: {
  analysis: CrisisAnalysis;
  label: string;
}) {
  const noAction = analysis.comparison.noAction;
  const gramRoute = analysis.comparison.gramRoute;
  const rows = [
    {
      label: 'Exam students on time',
      noAction: `${noAction.examStudentsOnTime}/${noAction.examStudentsTotal}`,
      gram: `${gramRoute.examStudentsOnTime}/${gramRoute.examStudentsTotal}`,
    },
    {
      label: 'Total students served',
      noAction: noAction.totalServed,
      gram: gramRoute.totalServed,
    },
    {
      label: 'Students unserved',
      noAction: noAction.studentsUnserved,
      gram: gramRoute.studentsUnserved,
    },
  ];
  return (
    <div className="rounded-xl border border-forest-100 bg-white p-3">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-forest-600">{label}</h3>
      <div className="mt-2 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 text-xs">
        <span className="font-medium text-forest-500">Metric</span>
        <span className="text-center font-bold text-forest-700">No action</span>
        <span className="text-center font-bold text-forest-800">GramRoute</span>
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <span className="text-forest-700">{row.label}</span>
            <span className="text-center font-semibold tabular-nums text-forest-700">{row.noAction}</span>
            <span className="text-center font-black tabular-nums text-forest-950">{row.gram}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CrisisPanel({ state }: CrisisPanelProps) {
  const analysis = useMemo(
    () => evaluateExamCrisis(state, state.simMinutes),
    [state],
  );
  if (!analysis.active) return null;

  const unservedExam = analysis.examStudents.filter(
    (student) => student.status === 'missed' || student.status === 'unassigned',
  ).length;

  return (
    <section
      className="overflow-hidden rounded-2xl border-2 border-red-300 bg-white shadow-sm"
      aria-labelledby="crisis-heading"
      aria-live="polite"
    >
      <div className="bg-gradient-to-r from-red-800 via-red-700 to-orange-700 px-4 py-3 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-red-100">
              <AlertOctagon size={15} aria-hidden="true" /> Exam-Day Crisis
            </div>
            <h2 id="crisis-heading" className="mt-0.5 font-display text-xl font-black">
              Two buses down · flooded village · exam priority
            </h2>
            <p className="mt-1 text-xs text-red-100">
              Demand {analysis.totalDemand} · allocatable seats {analysis.seatSupply} · short by{' '}
              {analysis.seatShortage} · simulated clock {formatClock(state.simMinutes)}
            </p>
          </div>
          <div className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-right">
            <div className="text-[10px] font-bold uppercase tracking-wide text-red-100">
              Exam students off track
            </div>
            <div className="font-display text-2xl font-black tabular-nums">{unservedExam}</div>
            <div className="text-[10px] text-red-100">missed or unassigned</div>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <ComparisonRow
            analysis={analysis}
            label="Before and after (same demand, seed and starting routes)"
          />
          <div className="rounded-xl border border-forest-100 bg-forest-50 p-3">
            <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-forest-700">
              <BusFront size={13} aria-hidden="true" /> Existing buses moved to worst-hit routes
            </h3>
            {analysis.busMoves.length === 0 ? (
              <p className="mt-2 text-xs text-forest-600">
                No low-risk running route currently has a spare bus. All moves reuse buses already in
                the fleet.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {analysis.busMoves.map((move) => (
                  <li key={`${move.busId}-${move.toRouteId}`} className="rounded-lg bg-white p-2 text-xs text-forest-800">
                    <div className="font-bold">
                      {move.busLabel}: Route {move.fromRouteCode} → Route {move.toRouteCode} (
                      {move.seats} seats)
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-forest-600">{move.reason}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-medium text-forest-500">
                      <span>Readiness {move.readinessMinutes} min</span>
                      <span>Reposition {move.repositionMinutes} min</span>
                      <span>
                        Source risk {Math.round(move.sourceImpact.riskBefore * 100)}% →{' '}
                        {Math.round(move.sourceImpact.riskAfter * 100)}%
                      </span>
                      <span>
                        {move.sourceImpact.studentsLeftWithoutSeats === 0
                          ? 'No source-route student stranded'
                          : `${move.sourceImpact.studentsLeftWithoutSeats} source-route student(s) at risk`}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div>
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-forest-700">
              <GraduationCap size={14} aria-hidden="true" /> Exam countdown and slack
            </h3>
            <div className="scrollbar-thin mt-2 max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {analysis.examStudents.map((student) => {
                const tone = STATUS_TONE[student.status];
                const village = state.stops.find((stop) => stop.id === student.villageId);
                return (
                  <article
                    key={student.pingId}
                    className={`rounded-xl border p-2.5 ${tone.border} ${tone.bg}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-1.5">
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
                        <div>
                          <div className="text-xs font-bold text-forest-950">
                            {student.alias} · {village?.name}
                          </div>
                          <div className={`text-[11px] font-semibold ${tone.text}`}>
                            {tone.label} · {student.vehicleLabel ?? 'no vehicle assigned'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-black tabular-nums text-forest-950">
                          {student.minutesUntilExam} min to exam
                        </div>
                        <div className={`text-[11px] font-semibold tabular-nums ${tone.text}`}>
                          {typeof student.slackMinutes === 'number'
                            ? `${student.slackMinutes >= 0 ? '+' : ''}${student.slackMinutes} min slack`
                            : 'slack pending'}
                        </div>
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-forest-600">
                      <span>Exam {formatClock(student.examStartMin)}</span>
                      <span>ETA {student.etaMinutes ?? '—'} min</span>
                      <span>15-min arrival buffer</span>
                    </div>
                    {student.status === 'missed' || student.status === 'unassigned' ? (
                      <p className="mt-1 text-[10px] leading-relaxed text-red-800">
                        {student.reason}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-forest-700">
              <XCircle size={14} className="text-red-600" aria-hidden="true" /> Unserved students
            </h3>
            <div className="scrollbar-thin mt-2 max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {analysis.unserved.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">
                  <CheckCircle2 size={14} aria-hidden="true" /> Everyone in the active demand set has a
                  feasible vehicle.
                </div>
              ) : (
                analysis.unserved.map((student) => (
                  <div key={student.pingId} className="rounded-xl border border-red-200 bg-red-50 p-2 text-xs">
                    <div className="font-bold text-red-900">
                      {student.alias}
                      {student.examStartMin !== undefined
                        ? ` · exam ${formatClock(student.examStartMin)}`
                        : ' · no exam'}
                    </div>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-red-700">{student.reason}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-forest-100 pt-2 text-[10px] text-forest-500">
          <span className="flex items-center gap-1">
            <Clock size={11} aria-hidden="true" /> Countdown updates with the simulated clock.
          </span>
          <span className="flex items-center gap-1">
            <Users size={11} aria-hidden="true" /> On time = vehicle ETA + 15-minute buffer ≤ exam start.
          </span>
          <span>
            No action = seeded starting routes, surviving service only, request order, no community
            relief. Both sides use the same demand, closures, starting positions, simulated time and
            seed.
          </span>
        </div>
      </div>
    </section>
  );
}
