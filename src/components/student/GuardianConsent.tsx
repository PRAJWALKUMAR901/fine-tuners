import { useState } from 'react';
import type { Dispatch, FormEvent } from 'react';
import { CheckCircle2, KeyRound, Lock, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { Dispatch as TripDispatch, MobilityState } from '../../types/mobility';
import { actionCreators, type MobilityAction } from '../../state/actions';

interface GuardianConsentProps {
  state: MobilityState;
  dispatch: Dispatch<MobilityAction>;
  trip: TripDispatch;
  t: (key: string) => string;
}

export function GuardianConsent({ state, dispatch, trip, t }: GuardianConsentProps) {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');

  const confirmed = trip.consent.status === 'confirmed';
  const declined = state.pings.some(
    (ping) => trip.pingIds.includes(ping.id) && ping.status === 'cancelled',
  );

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (declined) return;
    if (otp.trim() === trip.consent.otp) {
      setError('');
      dispatch(actionCreators.confirmConsent(trip.id, otp));
    } else {
      setError(t('guardian.error'));
    }
  };

  return (
    <section className="card p-4" aria-labelledby="guardian-heading">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="guardian-heading" className="panel-title flex items-center gap-2">
            <Lock size={16} className="text-forest-600" aria-hidden="true" />
            {t('guardian.title')}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-forest-600">{t('guardian.subtitle')}</p>
        </div>
        <span
          className={`chip ${
            confirmed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
          }`}
        >
          {confirmed ? t('guardian.confirmed') : t('guardian.pending')}
        </span>
      </div>

      <div className="mt-3 rounded-xl border border-dashed border-clay-300 bg-clay-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-clay-700">
              {t('guardian.otp')} · {state.studentProfile.guardianLabel}
            </div>
            <div className="mt-0.5 font-mono text-2xl font-black tracking-[0.25em] text-clay-900">
              {trip.consent.otp}
            </div>
          </div>
          <KeyRound size={22} className="text-clay-500" aria-hidden="true" />
        </div>
        <p className="mt-1 text-[11px] text-clay-800">
          Simulated OTP — shown only for the demo. No SMS is sent.
        </p>
      </div>

      {confirmed ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-900">
            <CheckCircle2 size={16} aria-hidden="true" />
            {t('guardian.confirmed')}
          </div>
          <p className="mt-1 text-xs text-emerald-800">
            Guardian {state.studentProfile.guardianLabel} confirmed consent at simulated{' '}
            {trip.consent.confirmedAt ?? trip.updatedAt}. Coordinator approval is the next gate.
          </p>
        </div>
      ) : (
        <form className="mt-3" onSubmit={submit}>
          <label htmlFor={`otp-${trip.id}`} className="label">
            Enter the 4-digit guardian OTP
          </label>
          <div className="flex gap-2">
            <input
              id={`otp-${trip.id}`}
              className="field font-mono tracking-widest"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `otp-error-${trip.id}` : undefined}
            />
            <button type="submit" className="btn btn-primary shrink-0" disabled={otp.length !== 4}>
              {t('guardian.confirm')}
            </button>
          </div>
          {error ? (
            <p id={`otp-error-${trip.id}`} className="mt-1 flex items-center gap-1 text-xs font-semibold text-red-700">
              <TriangleAlert size={13} aria-hidden="true" /> {error}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-forest-600">
              Demo shortcut: the OTP is displayed above; the SMS simulator confirm button sends YES.
            </p>
          )}
          <button
            type="button"
            className="btn btn-sm mt-2"
            onClick={() => {
              setOtp(trip.consent.otp);
              setError('');
            }}
          >
            Use demo OTP
          </button>
        </form>
      )}

      <div className="mt-3 rounded-xl border border-forest-200 bg-forest-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-forest-700">
            <ShieldCheck size={13} aria-hidden="true" /> {t('student.safetyCode')}
          </span>
          <span className="font-mono text-lg font-black tracking-[0.2em] text-forest-950">
            {trip.safetyCode}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-forest-700">
          Share only with the assigned driver. Safety code is checked before boarding.
        </p>
      </div>
    </section>
  );
}
