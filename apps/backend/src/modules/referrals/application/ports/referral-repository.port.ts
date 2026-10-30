import { type Money } from '../../../../shared/domain/value-objects/money';

export const REFERRALS = Symbol('REFERRALS');
export const REFERRAL_SETTINGS = Symbol('REFERRAL_SETTINGS');

/** Reglas provisionales de R7 (pending-scope), configurables. */
export interface ReferralSettings {
  /** Beneficio para el invitado y para el invitador, en la moneda de operación. */
  reward: Money;
  /** Invitados por los que cobra beneficio un invitador; los demás no suman. */
  maxRewardedInvites: number;
  /** Base del enlace de invitación (deep link de la app). */
  linkBaseUrl: string;
}

/** Estado del invitado, de menos a más avanzado (COPAYNI-52). */
export type InviteeStatus = 'registered' | 'joined_circle' | 'first_pay_in_paid';

export interface Invitee {
  /** Nombre minimizado (nombre e inicial del apellido) o el contacto enmascarado. */
  displayName: string;
  status: InviteeStatus;
  claimedAt: Date;
}

export interface InviteePage {
  items: Invitee[];
  nextCursor: string | null;
}

/** Montos en unidades menores de la moneda de operación. */
export interface ReferralTotals {
  earned: number;
  redeemed: number;
}

export interface ReferralRepositoryPort {
  /**
   * Lo ganado: su propio beneficio si usó un código, más el de sus invitados que ya pagaron su
   * primera cuota, hasta `maxRewardedInvites` (los primeros en usar el código). Lo canjeado: la
   * suma de los descuentos aplicados.
   */
  totalsOf(userId: string, maxRewardedInvites: number): Promise<ReferralTotals>;
  /** Sus invitados, del más reciente al más antiguo. Rechaza un cursor ajeno con InvalidCursorError. */
  inviteesOf(userId: string, limit: number, cursor: string | null): Promise<InviteePage>;
  /** El código del usuario; lo crea la primera vez (único en todos los usuarios). */
  codeOf(userId: string): Promise<string>;
  /** El dueño de un código, o `null` si no existe. */
  ownerOf(code: string): Promise<string | null>;
  /** El invitador del usuario, si ya usó un código. */
  inviterOf(userId: string): Promise<string | null>;
  /** Si el usuario ya es o fue miembro de algún círculo. */
  hasJoinedACircle(userId: string): Promise<boolean>;
  /**
   * Registra que `inviteeId` usó el código de `inviterId`, con el beneficio vigente congelado.
   * `false` si ya había usado uno (una sola vez por usuario).
   */
  claim(inviteeId: string, inviterId: string, reward: Money): Promise<boolean>;
}
