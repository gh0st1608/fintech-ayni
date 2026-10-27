import type { Money } from '@/domain/shared/value-objects/Money';

/**
 * Borrador inmutable del flujo de unión a un Game'ya. Cada paso devuelve un borrador nuevo;
 * los pasos 2 y 3 (COPAYNI-29 y 30) añadirán la cuota y el turno.
 */
export class JoinCircleDraft {
  private constructor(readonly payoutAmount: Money | null) {}

  static empty(): JoinCircleDraft {
    return new JoinCircleDraft(null);
  }

  withPayoutAmount(amount: Money): JoinCircleDraft {
    return new JoinCircleDraft(amount);
  }
}
