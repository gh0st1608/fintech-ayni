import { DomainError } from '@/domain/shared/errors/DomainError';
import type { Money } from '@/domain/shared/value-objects/Money';

import type { InstallmentOption } from './value-objects/InstallmentOption';
import type { Slot } from './value-objects/Slot';

export class IncompleteJoinDraftError extends DomainError {
  readonly code = 'INCOMPLETE_JOIN_DRAFT';
}

/**
 * Borrador inmutable del flujo de unión a un Game'ya. Cada paso devuelve un borrador nuevo y
 * cambiar un paso descarta lo elegido en los siguientes, que dependen de él.
 */
export class JoinCircleDraft {
  private constructor(
    readonly payoutAmount: Money | null,
    readonly installment: InstallmentOption | null,
    readonly slot: Slot | null,
  ) {}

  static empty(): JoinCircleDraft {
    return new JoinCircleDraft(null, null, null);
  }

  /** Repetir el mismo monto conserva la cuota y el turno; otro monto los descarta. */
  withPayoutAmount(amount: Money): JoinCircleDraft {
    if (this.payoutAmount?.equals(amount)) return this;
    return new JoinCircleDraft(amount, null, null);
  }

  withInstallment(option: InstallmentOption): JoinCircleDraft {
    if (!this.payoutAmount) {
      throw new IncompleteJoinDraftError('Choose the payout amount before the installment');
    }
    const keepsSlot = this.installment?.sameAs(option) ?? false;
    return new JoinCircleDraft(this.payoutAmount, option, keepsSlot ? this.slot : null);
  }

  withSlot(slot: Slot): JoinCircleDraft {
    if (!this.payoutAmount || !this.installment) {
      throw new IncompleteJoinDraftError('Choose the payout and the installment before the slot');
    }
    return new JoinCircleDraft(this.payoutAmount, this.installment, slot);
  }
}
