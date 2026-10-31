import type { Money } from '@/domain/shared/value-objects/Money';

import type { ReferralInvite, ReferralsPage } from '../Referral';

/** Referidos del usuario autenticado (docs/api/referrals.md). */
export interface ReferralRepositoryPort {
  /** GET /me/referral: el código se crea en la primera consulta y no cambia. */
  getMine(signal?: AbortSignal): Promise<ReferralInvite>;
  /** GET /me/referrals: saldo e invitados, del más reciente al más antiguo. */
  listReferrals(cursor: string | null, signal?: AbortSignal): Promise<ReferralsPage>;
  /** POST /me/referral/claim: devuelve el descuento que recibirá en su primera cuota. */
  claim(code: string): Promise<Money>;
}
