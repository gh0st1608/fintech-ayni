import { createContext, useContext, useMemo, useState } from 'react';

import { JoinCircleDraft } from '@/domain/circles/JoinCircleDraft';
import type { Money } from '@/domain/shared/value-objects/Money';

interface JoinFlowValue {
  draft: JoinCircleDraft;
  /** Empieza un flujo nuevo; "Join now" de Home pasa el monto del círculo (COPAYNI-25). */
  start: (payoutAmount?: Money) => void;
  setPayoutAmount: (amount: Money) => void;
}

const JoinFlowContext = createContext<JoinFlowValue | null>(null);

/** Borrador del flujo de unión entre pasos. Vive solo en memoria: nunca se guarda en disco. */
export function JoinFlowProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState(JoinCircleDraft.empty);

  const value = useMemo<JoinFlowValue>(
    () => ({
      draft,
      start: (payoutAmount) => {
        const empty = JoinCircleDraft.empty();
        setDraft(payoutAmount ? empty.withPayoutAmount(payoutAmount) : empty);
      },
      setPayoutAmount: (amount) => setDraft((current) => current.withPayoutAmount(amount)),
    }),
    [draft],
  );

  return <JoinFlowContext.Provider value={value}>{children}</JoinFlowContext.Provider>;
}

export function useJoinFlow(): JoinFlowValue {
  const value = useContext(JoinFlowContext);
  if (!value) throw new Error('useJoinFlow must be used within JoinFlowProvider');
  return value;
}
