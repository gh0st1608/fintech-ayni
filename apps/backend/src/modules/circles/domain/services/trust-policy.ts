import { DomainError } from '../../../../shared/errors/app-error';
import { type SlotType } from './slot-pricing';

/** Por qué un usuario no puede tomar un tipo de turno (COPAYNI-60). */
export const SLOT_RESTRICTIONS = [
  'trust_required',
  'identity_required',
  'income_required',
] as const;
export type SlotRestriction = (typeof SLOT_RESTRICTIONS)[number];

/** Lo que se sabe del comportamiento y los datos del usuario para darle confianza. */
export interface TrustProfile {
  /** Círculos que terminó sin ser expulsado. */
  readonly completedCircles: number;
  readonly identityVerified: boolean;
  readonly incomeDeclared: boolean;
}

export interface TrustSettings {
  /** Círculos completados sin expulsión que pide Fastest Payout (R18, propuesto: 1). */
  readonly fastestMinCompletedCircles: number;
}

export class SlotNotAllowedError extends DomainError {
  constructor(reason: SlotRestriction) {
    super('SLOT_NOT_ALLOWED', 'Todavía no puedes tomar ese tipo de turno', { reason });
  }
}

/**
 * Regla de confianza por tipo de turno (pending-scope §3.1, valores propuestos de R18): quien cobra
 * antes tiene más riesgo de dejar de pagar.
 * - Fastest Payout: al menos `fastestMinCompletedCircles` círculos completados sin expulsión.
 * - Lowest Fees: identidad verificada e ingreso declarado.
 * - Highest Return: identidad verificada.
 * Devuelve el motivo si no puede tomarlo, o `null`.
 */
export function slotRestriction(
  type: SlotType,
  profile: TrustProfile,
  settings: TrustSettings,
): SlotRestriction | null {
  if (!profile.identityVerified) return 'identity_required';
  if (type === 'fastest_payout' && profile.completedCircles < settings.fastestMinCompletedCircles) {
    return 'trust_required';
  }
  if (type === 'lowest_fees' && !profile.incomeDeclared) return 'income_required';
  return null;
}

export function assertSlotAllowed(
  type: SlotType,
  profile: TrustProfile,
  settings: TrustSettings,
): void {
  const restriction = slotRestriction(type, profile, settings);
  if (restriction) throw new SlotNotAllowedError(restriction);
}
