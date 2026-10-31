import { DomainError } from '@/domain/shared/errors/DomainError';
import type { Money } from '@/domain/shared/value-objects/Money';

/** Mi código de invitación (COPAYNI-51): el beneficio es el mismo para el invitado y el invitador. */
export interface ReferralInvite {
  code: string;
  /** Deep link con el código (`ayni://invite?code=…`). */
  link: string;
  reward: Money;
}

export type InviteeStatus = 'registered' | 'joinedCircle' | 'firstPayInPaid';

/** Invitado con los datos personales minimizados por el backend ("Ana Q." o un contacto enmascarado). */
export interface Invitee {
  displayName: string;
  status: InviteeStatus;
  claimedAt: Date;
}

export interface ReferralSummary {
  earned: Money;
  redeemed: Money;
  balance: Money;
}

/** Una página de My Referrals (COPAYNI-52): el saldo viaja con cada página. */
export interface ReferralsPage {
  summary: ReferralSummary;
  invitees: Invitee[];
  /** `null` si no hay más páginas. */
  nextCursor: string | null;
}

export class InvalidReferralSummaryError extends DomainError {
  readonly code = 'INVALID_REFERRAL_SUMMARY';
}

/** El saldo debe ser lo ganado menos lo canjeado, en una sola moneda; si no, no se muestra. */
export function assertReferralSummary(summary: ReferralSummary): ReferralSummary {
  const { earned, redeemed, balance } = summary;
  const consistent =
    redeemed.currency === earned.currency &&
    balance.currency === earned.currency &&
    redeemed.add(balance).equals(earned);
  if (!consistent) throw new InvalidReferralSummaryError('Referral balance is inconsistent');
  return summary;
}
