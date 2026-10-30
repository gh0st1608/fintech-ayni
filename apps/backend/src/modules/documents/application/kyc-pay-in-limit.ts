import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfigService } from '../../../config/configuration';
import { Money } from '../../../shared/domain/value-objects/money';
import { KYC_STATUS, type KycStatusPort } from './ports';

/**
 * Límite mensual de pay-in (pending-scope R5, provisional): con un comprobante de ingresos
 * aprobado, `PAYIN_LIMIT_INCOME_SHARE_BPS` del ingreso; sin él, `JOIN_MONTHLY_PAYIN_LIMIT`
 * (0 = sin límite). Lo usan el perfil y la unión a un círculo.
 */
@Injectable()
export class KycPayInLimit {
  private readonly fallback: Money | null;
  private readonly shareBps: number;

  constructor(
    @Inject(ConfigService) config: AppConfigService,
    @Inject(KYC_STATUS) private readonly kyc: KycStatusPort,
  ) {
    const amount = config.get('JOIN_MONTHLY_PAYIN_LIMIT', { infer: true });
    this.fallback =
      amount > 0 ? Money.of(amount, config.get('DEFAULT_CURRENCY', { infer: true })) : null;
    this.shareBps = config.get('PAYIN_LIMIT_INCOME_SHARE_BPS', { infer: true });
  }

  async monthlyLimitFor(userId: string): Promise<Money | null> {
    const income = await this.kyc.approvedMonthlyIncome(userId);
    return income ? income.percentage(this.shareBps) : this.fallback;
  }
}
