import { DomainError } from '@/domain/shared/errors/DomainError';
import type { Money } from '@/domain/shared/value-objects/Money';

import type { InstallmentOption } from './value-objects/InstallmentOption';

export class IncompleteJoinDraftError extends DomainError {
  readonly code = 'INCOMPLETE_JOIN_DRAFT';
}

/**
 * Borrador inmutable del flujo de unión a un Game'ya. Cada paso devuelve un borrador nuevo;
 * el paso 3 (COPAYNI-30) añadirá el turno.
 */
export class JoinCircleDraft {
  private constructor(
    readonly payoutAmount: Money | null,
    readonly installment: InstallmentOption | null,
  ) {}

  static empty(): JoinCircleDraft {
    return new JoinCircleDraft(null, null);
  }

  /** Cambiar el monto invalida la cuota elegida: las opciones dependen del payout. */
  withPayoutAmount(amount: Money): JoinCircleDraft {
    const keepsInstallment = this.payoutAmount?.equals(amount) ?? false;
    return new JoinCircleDraft(amount, keepsInstallment ? this.installment : null);
  }

  withInstallment(option: InstallmentOption): JoinCircleDraft {
    if (!this.payoutAmount) {
      throw new IncompleteJoinDraftError('Choose the payout amount before the installment');
    }
    return new JoinCircleDraft(this.payoutAmount, option);
  }
}
