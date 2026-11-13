import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CloudRain,
  Flag,
  GitMerge,
  Info,
  MessageSquare,
  Play,
  ScrollText,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { DecisionLogEntry, MobilityState } from '../../types/mobility';
import { formatClock } from '../../utils/formatters';

interface DecisionLogProps {
  state: MobilityState;
  t: (key: string) => string;
}

const kindIcons: Record<DecisionLogEntry['kind'], typeof Info> = {
  system: Info,
  request: MessageSquare,
  match: GitMerge,
  consent: ShieldCheck,
  approval: CheckCircle2,
  dispatch: Play,
  completion: Flag,
  cancellation: XCircle,
  disruption: CloudRain,
  safety: AlertTriangle,
  simulation: Clock,
};

const kindTone: Record<DecisionLogEntry['kind'], string> = {
  system: 'bg-forest-100 text-forest-700',
  request: 'bg-sky-100 text-sky-800',
  match: 'bg-clay-100 text-clay-800',
  consent: 'bg-emerald-100 text-emerald-800',
  approval: 'bg-forest-200 text-forest-900',
  dispatch: 'bg-clay-200 text-clay-900',
  completion: 'bg-emerald-100 text-emerald-800',
  cancellation: 'bg-red-100 text-red-800',
  disruption: 'bg-amber-100 text-amber-900',
  safety: 'bg-red-100 text-red-800',
  simulation: 'bg-forest-50 text-forest-600',
};

export function DecisionLog({ state, t }: DecisionLogProps) {
  const [filter, setFilter] = useState<'all' | 'dispatches' | 'safety'>('all');
  const entries = [...state.decisionLog]
    .reverse()
    .filter((entry) =>
      filter === 'all'
        ? true
        : filter === 'safety'
          ? entry.kind === 'safety' || entry.kind === 'disruption'
          : ['match', 'consent', 'approval', 'dispatch', 'completion', 'cancellation'].includes(entry.kind),
    )
    .slice(0, 40);

  return (
    <section className="card p-4" aria-labelledby="decision-log-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="decision-log-heading" className="panel-title flex items-center gap-2">
            <ScrollText size={16} className="text-forest-600" aria-hidden="true" />
            {t('coordinator.log')}
          </h2>
          <p className="text-xs text-forest-600">
            Every state transition is recorded with simulated time and actor.
          </p>
        </div>
        <label className="text-xs font-semibold text-forest-700">
          <span className="sr-only">Filter decision log</span>
          <select
            className="field min-h-[36px] w-auto py-1 text-xs"
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
          >
            <option value="all">All events</option>
            <option value="dispatches">Dispatch lifecycle</option>
            <option value="safety">Safety &amp; disruption</option>
          </select>
        </label>
      </div>

      <ol className="scrollbar-thin mt-3 max-h-[380px] space-y-2 overflow-y-auto pr-1">
        {entries.map((entry) => {
          const Icon = kindIcons[entry.kind];
          return (
            <li key={entry.id} className="flex gap-2 rounded-xl border border-forest-50 bg-white p-2">
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${kindTone[entry.kind]}`}>
                <Icon size={13} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10px] tabular-nums text-forest-500">
                    {formatClock(entry.at)}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wide text-forest-500">
                    {entry.kind} · {entry.actor}
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-forest-800">{entry.message}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[10px] text-forest-500">
        Showing {entries.length} of {state.decisionLog.length} decision entries. Logs persist across
        cancellations by design.
      </p>
    </section>
  );
}
