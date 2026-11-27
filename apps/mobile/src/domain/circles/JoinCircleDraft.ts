import type { PayoutMethodType } from '@/domain/payouts/value-objects/PayoutMethod';
import { DomainError } from '@/domain/shared/errors/DomainError';
import type { Money } from '@/domain/shared/value-objects/Money';

import type { JoinDraftRequest } from './JoinedCircle';
import type { Cadence } from './MyCircleDetail';
import type { JoinTarget } from './RecommendedCircle';
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
    /**
     * Frecuencia elegida (COPAYNI-116). Es el paso 0 y arranca en la mensual, que es la única
     * que existía: cambiarla descarta todo lo elegido después, porque las cuotas, los turnos y
     * las fechas dependen de ella.
     */
    readonly cadence: Cadence,
    readonly payoutAmount: Money | null,
    readonly installment: InstallmentOption | null,
    readonly slot: Slot | null,
    /** Paso 4: método de cobro. Es una preferencia del usuario, así que no depende de los pasos previos. */
    readonly payoutMethod: PayoutMethodType | null = null,
    /** El círculo recomendado de "Join now" (COPAYNI-59); `null` si el backend lo asigna. */
    readonly target: JoinTarget | null = null,
  ) {}

  static empty(): JoinCircleDraft {
    return new JoinCircleDraft('monthly', null, null, null);
  }

  /** Empieza desde un recomendado: ese monto y, para pedir sus slots, ese círculo. */
  static forTarget(amount: Money, target: JoinTarget): JoinCircleDraft {
    return new JoinCircleDraft(target.cadence ?? 'monthly', amount, null, null, null, target);
  }

  /**
   * Repetir la misma frecuencia no cambia nada; otra descarta el monto, la cuota y el turno,
   * porque las combinaciones ofrecibles y las fechas se recalculan (COPAYNI-116).
   */
  withCadence(cadence: Cadence): JoinCircleDraft {
    if (this.cadence === cadence) return this;
    return new JoinCircleDraft(cadence, this.payoutAmount, null, null, this.payoutMethod);
  }

  /** Repetir el mismo monto conserva la cuota y el turno; otro monto los descarta. */
  withPayoutAmount(amount: Money): JoinCircleDraft {
    if (this.payoutAmount?.equals(amount)) return this;
    return new JoinCircleDraft(this.cadence, amount, null, null, this.payoutMethod);
  }

  /** El círculo cuyos slots se piden: el recomendado, si la duración elegida es la suya. */
  slotsCircleId(): string | null {
    return this.target && this.installment?.months === this.target.months
      ? this.target.circleId
      : null;
  }

  withInstallment(option: InstallmentOption): JoinCircleDraft {
    if (!this.payoutAmount) {
      throw new IncompleteJoinDraftError('Choose the payout amount before the installment');
    }
    const keepsSlot = this.installment?.sameAs(option) ?? false;
    return new JoinCircleDraft(
      this.cadence,
      this.payoutAmount,
      option,
      keepsSlot ? this.slot : null,
      this.payoutMethod,
      this.target,
    );
  }

  withSlot(slot: Slot): JoinCircleDraft {
    if (!this.payoutAmount || !this.installment) {
      throw new IncompleteJoinDraftError('Choose the payout and the installment before the slot');
    }
    return new JoinCircleDraft(
      this.cadence,
      this.payoutAmount,
      this.installment,
      slot,
      this.payoutMethod,
      this.target,
    );
  }

  withPayoutMethod(type: PayoutMethodType): JoinCircleDraft {
    if (!this.payoutAmount || !this.installment || !this.slot) {
      throw new IncompleteJoinDraftError('Choose the slot before the payout method');
    }
    return new JoinCircleDraft(
      this.cadence,
      this.payoutAmount,
      this.installment,
      this.slot,
      type,
      this.target,
    );
  }

  /** Los cuatro pasos están elegidos: se puede confirmar la unión (COPAYNI-31). */
  isComplete(): boolean {
    return (
      this.payoutAmount !== null &&
      this.installment !== null &&
      this.slot !== null &&
      this.payoutMethod !== null
    );
  }

  /**
   * Lo que se envía al unirse. El método de cobro no va: el backend usa el que tiene guardado
   * (COPAYNI-37), que el paso 4 ya guardó.
   */
  joinRequest(): JoinDraftRequest {
    if (!this.isComplete()) {
      throw new IncompleteJoinDraftError('Complete the four steps before joining');
    }
    return {
      circleId: this.slot!.circleId,
      payout: this.payoutAmount!,
      months: this.installment!.turns,
      position: this.slot!.position,
      cadence: this.cadence,
    };
  }
}

/** Dos borradores con la misma huella piden la misma unión: comparten la clave de idempotencia. */
export function joinRequestFingerprint(request: JoinDraftRequest): string {
  const { circleId, payout, months, position, cadence } = request;
  // La cadencia entra en la huella: el mismo monto y turno en otra frecuencia es otra unión.
  return [
    circleId ?? 'new',
    payout.currency,
    payout.amount,
    months,
    position,
    cadence ?? 'monthly',
  ].join('|');
}
