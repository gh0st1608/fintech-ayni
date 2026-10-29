import { Inject, Injectable } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import {
  PAYMENT_SETTINGS,
  type PaymentSettings,
  type PaymentSettingsPort,
} from '../ports/payment-settings.port';

/** `GET /v1/me/payment-settings` (COPAYNI-38). */
@Injectable()
export class GetPaymentSettingsUseCase {
  constructor(@Inject(PAYMENT_SETTINGS) private readonly settings: PaymentSettingsPort) {}

  execute(principal: Principal): Promise<PaymentSettings> {
    return this.settings.get(principal.userId);
  }
}

/**
 * `PATCH /v1/me/payment-settings` (COPAYNI-38). El ciclo mensual la aplica al abrir el mes de
 * cobro del usuario: si ese mes ya se abrió, el cambio cuenta desde su próximo turno.
 */
@Injectable()
export class UpdatePaymentSettingsUseCase {
  constructor(@Inject(PAYMENT_SETTINGS) private readonly settings: PaymentSettingsPort) {}

  async execute(principal: Principal, changes: Partial<PaymentSettings>): Promise<PaymentSettings> {
    const updated = { ...(await this.settings.get(principal.userId)), ...changes };
    await this.settings.save(principal.userId, updated);
    return updated;
  }
}
