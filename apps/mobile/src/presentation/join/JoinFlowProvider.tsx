import { createContext, useContext, useMemo, useState } from 'react';

import { JoinCircleDraft } from '@/domain/circles/JoinCircleDraft';
import type { Cadence } from '@/domain/circles/MyCircleDetail';
import type { JoinTarget } from '@/domain/circles/RecommendedCircle';
import type { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import type { Slot } from '@/domain/circles/value-objects/Slot';
import type { PayoutMethodType } from '@/domain/payouts/value-objects/PayoutMethod';
import type { Money } from '@/domain/shared/value-objects/Money';

/** Qué paso cambió y obligó a recalcular lo que venía después (COPAYNI-116). */
export type JoinDiscarded = 'cadence' | 'amount' | null;

interface JoinFlowValue {
  draft: JoinCircleDraft;
  /**
   * Lo que el último cambio descartó, para avisar de que las opciones se recalcularon. La
   * pantalla que lo muestra lo limpia con `clearDiscarded`.
   */
  discarded: JoinDiscarded;
  clearDiscarded: () => void;
  /**
   * Empieza un flujo nuevo; "Join now" de Home pasa el monto del círculo (COPAYNI-25) y, para
   * pedir sus slots, el círculo (COPAYNI-59).
   */
  start: (payoutAmount?: Money, target?: JoinTarget) => void;
  /** Paso de frecuencia (COPAYNI-116): cambiarla descarta el monto y los turnos. */
  setCadence: (cadence: Cadence) => void;
  setPayoutAmount: (amount: Money) => void;
  setInstallment: (option: InstallmentOption) => void;
  setSlot: (slot: Slot) => void;
  setPayoutMethod: (type: PayoutMethodType) => void;
}

const JoinFlowContext = createContext<JoinFlowValue | null>(null);

/** Borrador del flujo de unión entre pasos. Vive solo en memoria: nunca se guarda en disco. */
export function JoinFlowProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState(JoinCircleDraft.empty);
  const [discarded, setDiscarded] = useState<JoinDiscarded>(null);

  const value = useMemo<JoinFlowValue>(
    () => ({
      draft,
      discarded,
      clearDiscarded: () => setDiscarded(null),
      start: (payoutAmount, target) => {
        const empty = JoinCircleDraft.empty();
        setDiscarded(null);
        if (payoutAmount && target) setDraft(JoinCircleDraft.forTarget(payoutAmount, target));
        else setDraft(payoutAmount ? empty.withPayoutAmount(payoutAmount) : empty);
      },
      // Solo se avisa si de verdad se descartó algo: cambiar un paso sin haber elegido los
      // siguientes no recalcula nada que la persona haya visto.
      setCadence: (cadence) =>
        setDraft((current) => {
          const next = current.withCadence(cadence);
          if (current.installment && !next.installment) setDiscarded('cadence');
          return next;
        }),
      setPayoutAmount: (amount) =>
        setDraft((current) => {
          const next = current.withPayoutAmount(amount);
          if (current.installment && !next.installment) setDiscarded('amount');
          return next;
        }),
      setInstallment: (option) => setDraft((current) => current.withInstallment(option)),
      setSlot: (slot) => setDraft((current) => current.withSlot(slot)),
      setPayoutMethod: (type) => setDraft((current) => current.withPayoutMethod(type)),
    }),
    [draft, discarded],
  );

  return <JoinFlowContext.Provider value={value}>{children}</JoinFlowContext.Provider>;
}

export function useJoinFlow(): JoinFlowValue {
  const value = useContext(JoinFlowContext);
  if (!value) throw new Error('useJoinFlow must be used within JoinFlowProvider');
  return value;
}
