import type { Money } from '@/domain/shared/value-objects/Money';

export type StartDecision = 'accepted' | 'withdrawn';

export interface StartTerms {
  payout: Money;
  baseInstallment: Money;
  months: number;
}

/** Propuesta de empezar reducido un círculo que no se llenó (COPAYNI-62). */
export interface StartProposal {
  circleId: string;
  current: StartTerms;
  proposed: StartTerms;
  /** Turno en el círculo reducido. */
  position: number;
  netPayout: Money;
  firstInstallment: Money;
  totalPaid: Money;
  /** Último día para responder, `YYYY-MM-DD`. */
  respondBy: string;
  decision: StartDecision | null;
}
