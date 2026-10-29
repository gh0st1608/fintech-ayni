import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfigService } from '../../../config/configuration';
import { Money } from '../../../shared/domain/value-objects/money';
import { type PayInLimitPort } from '../application/ports/pay-in-limit.port';

/**
 * Límite provisional, igual para todos: `JOIN_MONTHLY_PAYIN_LIMIT`, la misma variable que valida
 * la unión a un círculo (0 = sin límite). Se reemplaza al definir la fórmula de R5 con el ingreso
 * declarado (COPAYNI-48).
 */
@Injectable()
export class ConfigPayInLimit implements PayInLimitPort {
  private readonly limit: Money | null;

  constructor(@Inject(ConfigService) config: AppConfigService) {
    const amount = config.get('JOIN_MONTHLY_PAYIN_LIMIT', { infer: true });
    this.limit =
      amount > 0 ? Money.of(amount, config.get('DEFAULT_CURRENCY', { infer: true })) : null;
  }

  monthlyLimitFor(): Promise<Money | null> {
    return Promise.resolve(this.limit);
  }
}
