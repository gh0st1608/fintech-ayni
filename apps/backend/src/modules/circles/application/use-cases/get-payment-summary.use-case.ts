import { Inject, Injectable } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { type LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { type Money } from '../../../../shared/domain/value-objects/money';
import { MEMBER_DEBTS, type MemberDebtsPort } from '../ports/member-debts.port';
import {
  type DueInstallment,
  PAYMENTS_QUERY,
  type PaymentsQueryPort,
} from '../ports/payments-query.port';

export interface PaymentSummary {
  duePayments: DueInstallment[];
  /** Suma de las cuotas por pagar; `null` si no hay. */
  totalDue: Money | null;
  nextDueOn: LocalDate | null;
  /** Deuda por impago (lo vencido más el cargo por mora, COPAYNI-57); `null` si no tiene. */
  debt: Money | null;
}

const sum = (amounts: Money[]): Money | null =>
  amounts.length === 0
    ? null
    : amounts.slice(1).reduce((total, amount) => total.add(amount), amounts[0]!);

/**
 * Resumen de la pestaña Payment (COPAYNI-35): lo que el usuario debe pagar y su deuda por impago.
 * Un solo país y una sola moneda en el MVP: sumar monedas distintas falla (InvalidMoneyError).
 */
@Injectable()
export class GetPaymentSummaryUseCase {
  constructor(
    @Inject(PAYMENTS_QUERY) private readonly payments: PaymentsQueryPort,
    @Inject(MEMBER_DEBTS) private readonly debts: MemberDebtsPort,
  ) {}

  async execute(principal: Principal): Promise<PaymentSummary> {
    const [duePayments, debts] = await Promise.all([
      this.payments.dueInstallmentsOf(principal.userId),
      this.debts.openDebtsOf(principal.userId),
    ]);
    return {
      duePayments,
      totalDue: sum(duePayments.map(({ amount }) => amount)),
      nextDueOn: duePayments[0]?.dueOn ?? null,
      debt: sum(debts.map(({ overdue, lateFee }) => overdue.add(lateFee))),
    };
  }
}
