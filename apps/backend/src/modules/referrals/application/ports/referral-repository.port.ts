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

export interface ReferralRepositoryPort {
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
