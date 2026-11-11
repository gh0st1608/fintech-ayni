import { Inject, Injectable } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { type PaymentStreak, paymentStreak } from '../../domain/services/payment-streak';
import { PAYMENTS_QUERY, type PaymentsQueryPort } from '../ports/payments-query.port';
import { CIRCLE_CYCLE, type CircleCycleSettings } from './cycle-settings';

/**
 * Racha de pagos a tiempo del usuario (COPAYNI-82, D11): el icono de fuego de Home. Por ahora
 * solo informativa; usarla en la regla de confianza (R18) es una decisión aparte.
 */
@Injectable()
export class GetPaymentStreakUseCase {
  constructor(
    @Inject(PAYMENTS_QUERY) private readonly payments: PaymentsQueryPort,
    @Inject(CIRCLE_CYCLE)
    private readonly cycle: Pick<CircleCycleSettings, 'timeZone' | 'delinquency'>,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(principal: Principal): Promise<PaymentStreak> {
    const history = await this.payments.installmentHistoryOf(principal.userId, this.cycle.timeZone);
    const today = LocalDate.fromDate(this.clock.now(), this.cycle.timeZone);
    return paymentStreak(history, today, this.cycle.delinquency.graceDays);
  }
}
