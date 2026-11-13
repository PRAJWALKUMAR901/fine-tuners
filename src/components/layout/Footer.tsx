import type { Dispatch } from 'react';
import { Database, RotateCcw, ShieldCheck } from 'lucide-react';
import type { MobilityState } from '../../types/mobility';
import { actionCreators, type MobilityAction } from '../../state/actions';

interface FooterProps {
  state: MobilityState;
  dispatch: Dispatch<MobilityAction>;
  t: (key: string) => string;
}

export function Footer({ state, dispatch, t }: FooterProps) {
  return (
    <footer className="mt-10 border-t border-forest-200 bg-white">
      <div className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-forest-900">
              <ShieldCheck size={17} className="text-forest-600" aria-hidden="true" />
              Privacy and data notice
            </div>
            <p className="text-xs leading-relaxed text-forest-700">{t('footer.privacy')}</p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-forest-500">
              <Database size={13} aria-hidden="true" />
              State is stored in this browser only. Seed {state.seed} · schema version 1 · all
              transport data is simulated.
            </p>
          </div>
          <button
            type="button"
            className="btn whitespace-nowrap"
            onClick={() => dispatch(actionCreators.reset(state.scenarioId))}
          >
            <RotateCcw size={15} aria-hidden="true" />
            {t('reset.data')}
          </button>
        </div>
      </div>
    </footer>
  );
}
