import { Inject, Injectable, Logger } from '@nestjs/common';

import { Money } from '../../../../shared/domain/value-objects/money';
import {
  REFERRAL_SETTINGS,
  REFERRALS,
  type ReferralRepositoryPort,
  type ReferralSettings,
} from '../../../referrals/application/ports/referral-repository.port';
import { LedgerTransaction } from '../../domain/value-objects/ledger-transaction';
import { GUARANTEE_FUND, type GuaranteeFundPort } from '../ports/guarantee-fund.port';

/**
 * Descuento de referidos en una cuota (COPAYNI-53): el saldo se descuenta solo, sin superar la
 * cuota. Se cobra la cuota menos el descuento y la cooperativa paga la diferencia
 * (`referral_discount`: de `operator` al pagador), así el registro contable sigue cuadrando con
 * el dinero real.
 */
@Injectable()
export class ReferralDiscounts {
  private readonly logger = new Logger('Referrals');

  constructor(
    @Inject(REFERRALS) private readonly referrals: ReferralRepositoryPort,
    @Inject(REFERRAL_SETTINGS) private readonly settings: ReferralSettings,
    @Inject(GUARANTEE_FUND) private readonly ledger: GuaranteeFundPort,
  ) {}

  /** Cuánto del saldo se aplica a una cuota de `amount`. */
  async quote(userId: string, amount: Money): Promise<Money> {
    const { earned, redeemed } = await this.referrals.totalsOf(
      userId,
      this.settings.maxRewardedInvites,
    );
    return Money.of(Math.min(amount.amount, Math.max(0, earned - redeemed)), amount.currency);
  }

  /** Registra el descuento aplicado a la cuota ya cobrada. Idempotente por cuota. */
  async apply(
    installment: { id: string; userId: string; circleId: string },
    discount: Money,
  ): Promise<void> {
    if (!discount.isPositive()) return;
    const redeemed = await this.referrals.redeem(
      installment.userId,
      `installment:${installment.id}`,
      discount,
      this.settings.maxRewardedInvites,
    );
    if (redeemed === 0) return;
    if (redeemed < discount.amount) {
      // Otra cuota gastó el saldo en paralelo: la cooperativa absorbe la diferencia.
      this.logger.warn({
        event: 'referrals.discount_exceeded_balance',
        userId: installment.userId,
        installmentId: installment.id,
        discount: discount.amount,
        redeemed,
      });
    }
    await this.ledger.record(
      LedgerTransaction.transfer({
        key: `referral_discount:${installment.id}`,
        kind: 'referral_discount',
        from: { account: 'operator' },
        to: { account: 'external', userId: installment.userId },
        amount: discount,
        circleId: installment.circleId,
      })!,
    );
    this.logger.log({
      event: 'referrals.discount_applied',
      userId: installment.userId,
      installmentId: installment.id,
      amount: discount.amount,
    });
  }
}
