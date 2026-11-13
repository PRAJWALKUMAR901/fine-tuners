import { useEffect, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import { BatteryFull, ChevronDown, MessageSquare, Send, ShieldAlert, Signal } from 'lucide-react';
import type { MobilityState } from '../../types/mobility';
import { actionCreators, type MobilityAction } from '../../state/actions';
import { formatClock } from '../../utils/formatters';

interface SmsSimulatorProps {
  state: MobilityState;
  dispatch: Dispatch<MobilityAction>;
  t: (key: string) => string;
  compact?: boolean;
}

interface SmsMessage {
  id: string;
  from: 'user' | 'system';
  text: string;
  at: number;
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}

export function SmsSimulator({ state, dispatch, t, compact }: SmsSimulatorProps) {
  const [messages, setMessages] = useState<SmsMessage[]>([
    {
      id: 'welcome',
      from: 'system',
      text: t('sms.welcome'),
      at: state.simMinutes,
    },
  ]);
  const [draft, setDraft] = useState('');
  const [pendingMatch, setPendingMatch] = useState(false);
  const handledPings = useRef<Set<string>>(new Set());
  const repliedDispatch = useRef<Set<string>>(new Set());

  const profile = state.studentProfile;
  const waitingPing = [...state.pings]
    .reverse()
    .find(
      (ping) =>
        ping.studentAlias === profile.alias &&
        ping.villageId === profile.villageId &&
        ping.destinationCollegeId === profile.collegeId &&
        (ping.status === 'waiting' || ping.status === 'clustered'),
    );
  const latestTrip = [...state.dispatches]
    .filter(
      (trip) =>
        trip.villageId === profile.villageId &&
        trip.destinationCollegeId === profile.collegeId &&
        trip.status !== 'cancelled',
    )
    .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1))[0];

  const pushMessage = (from: SmsMessage['from'], text: string): void => {
    setMessages((previous) => [
      ...previous,
      {
        id: `sms_${previous.length}_${from}_${state.simMinutes}`,
        from,
        text,
        at: state.simMinutes,
      },
    ]);
  };

  // A demo SMS request arrives from the guided demo; show it in the phone UI
  // and let the response flow below produce the match reply.
  useEffect(() => {
    const smsPings = state.pings.filter(
      (ping) =>
        ping.source === 'sms' &&
        ping.studentAlias === profile.alias &&
        !handledPings.current.has(ping.id) &&
        (ping.status === 'waiting' || ping.status === 'clustered'),
    );
    if (smsPings.length === 0) return;
    for (const ping of smsPings) {
      handledPings.current.add(ping.id);
      pushMessage('user', '1');
      setPendingMatch(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pings]);

  // Once the request exists, match the best feasible plan automatically and
  // reply with the matched vehicle, fare, ETA and safety code.
  useEffect(() => {
    if (!pendingMatch) return;

    if (latestTrip && latestTrip.status !== 'completed' && latestTrip.status !== 'cancelled') {
      if (repliedDispatch.current.has(latestTrip.id)) {
        setPendingMatch(false);
        return;
      }
      repliedDispatch.current.add(latestTrip.id);
      const vehicle = state.vehicles.find((candidate) => candidate.id === latestTrip.vehicleIds[0]);
      pushMessage(
        'system',
        fill(t('sms.match'), {
          vehicle: vehicle?.label ?? latestTrip.vehicleIds[0],
          fare: latestTrip.costPerStudent,
          eta: latestTrip.etaMinutes,
          code: latestTrip.safetyCode,
        }),
      );
      setPendingMatch(false);
      return;
    }

    // Wait for the request action to reach this component.
    if (!waitingPing) return;

    const cluster = state.clusters.find((candidate) => candidate.pingIds.includes(waitingPing.id));
    const plan = cluster
      ? state.plans.find(
          (candidate) => candidate.clusterId === cluster.id && candidate.feasibilityStatus !== 'infeasible',
        )
      : undefined;
    if (plan) {
      dispatch(actionCreators.matchPlan(plan.id));
      return;
    }
    // No cluster or no feasible vehicle: answer honestly instead of waiting.
    if (!cluster || state.plans.some((candidate) => candidate.clusterId === cluster.id)) {
      pushMessage('system', t('sms.noMatch'));
      setPendingMatch(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMatch, waitingPing, latestTrip, state.clusters, state.plans, state.vehicles, t, dispatch]);

  const tripForReply = latestTrip;
  const send = (raw: string): void => {
    const text = raw.trim();
    if (!text) return;
    pushMessage('user', text);
    setDraft('');
    const command = text.toUpperCase();
    if (command === '1') {
      if (!waitingPing) {
        dispatch(
          actionCreators.requestPing(profile.villageId, profile.collegeId, 'sms', profile.alias),
        );
      }
      setPendingMatch(true);
      pushMessage(
        'system',
        fill(t('sms.received1'), {
          place: state.stops.find((stop) => stop.id === profile.villageId)?.name ?? profile.villageId,
        }),
      );
      return;
    }
    if (command === 'YES') {
      if (!tripForReply) {
        pushMessage('system', t('sms.needMatch'));
        return;
      }
      if (tripForReply.consent.status === 'confirmed') {
        pushMessage('system', fill(t('sms.yesConfirmed'), { code: tripForReply.safetyCode }));
        return;
      }
      if (tripForReply.status === 'matched') {
        dispatch(actionCreators.confirmConsent(tripForReply.id, tripForReply.consent.otp));
        pushMessage('system', fill(t('sms.yesConfirmed'), { code: tripForReply.safetyCode }));
        return;
      }
      pushMessage('system', t('sms.needMatch'));
      return;
    }
    if (command === 'PANIC') {
      dispatch(
        actionCreators.safetyAlert(
          `Panic alert from ${profile.alias} near ${profile.villageId}: trip safety event logged.`,
          tripForReply?.id,
        ),
      );
      pushMessage(
        'system',
        fill(t('sms.panicAck'), { code: tripForReply?.safetyCode ?? '----' }),
      );
      return;
    }
    pushMessage('system', t('sms.unknown'));
  };

  const safetyEvents = state.decisionLog.filter((entry) => entry.kind === 'safety').slice(-4).reverse();

  return (
    <section className={`card overflow-hidden ${compact ? '' : ''}`} aria-labelledby="sms-heading">
      <div className="flex items-center justify-between border-b border-forest-100 bg-forest-950 px-4 py-3 text-white">
        <div>
          <h2 id="sms-heading" className="flex items-center gap-2 text-sm font-bold">
            <MessageSquare size={15} aria-hidden="true" /> {t('sms.title')}
          </h2>
          <p className="mt-0.5 text-[10px] text-forest-200">{t('sms.simulated')}</p>
        </div>
        <div className="flex items-center gap-1.5 text-forest-100" aria-hidden="true">
          <Signal size={13} />
          <BatteryFull size={15} />
        </div>
      </div>

      <div className="bg-forest-950 px-3 pb-3">
        <div className="scrollbar-thin flex h-64 flex-col gap-2 overflow-y-auto rounded-xl bg-[#eef1ec] p-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[88%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm ${
                message.from === 'user'
                  ? 'self-end bg-forest-700 text-white'
                  : 'self-start bg-white text-forest-900'
              }`}
            >
              <div>{message.text}</div>
              <div
                className={`mt-1 text-[9px] ${message.from === 'user' ? 'text-forest-200' : 'text-forest-500'}`}
              >
                {message.from === 'user' ? 'Meena' : 'GRAMROUTE'} · {formatClock(message.at)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 p-3">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <label htmlFor="sms-input" className="sr-only">
            SMS message
          </label>
          <input
            id="sms-input"
            className="field"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('sms.placeholder')}
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary shrink-0 px-3" aria-label={t('sms.send')}>
            <Send size={16} aria-hidden="true" />
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn btn-sm" onClick={() => send('1')}>
            1 · Request ride
          </button>
          <button type="button" className="btn btn-sm" onClick={() => send('YES')}>
            YES · Consent
          </button>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => send('PANIC')}>
            <ShieldAlert size={13} aria-hidden="true" /> PANIC
          </button>
        </div>

        <details className="rounded-xl border border-forest-100 bg-forest-50/60 p-2">
          <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-forest-800">
            <span>{t('sms.log')}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <ul className="mt-2 space-y-1">
            {safetyEvents.length === 0 ? (
              <li className="text-[11px] text-forest-600">
                No safety events. Trip codes stay with the student and driver.
              </li>
            ) : (
              safetyEvents.map((event) => (
                <li key={event.id} className="rounded-lg bg-white p-2 text-[11px] text-forest-800">
                  <span className="font-semibold">{formatClock(event.at)}</span> · {event.message}
                </li>
              ))
            )}
          </ul>
        </details>
      </div>
    </section>
  );
}
