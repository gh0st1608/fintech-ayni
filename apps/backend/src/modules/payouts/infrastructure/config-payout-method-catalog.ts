import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfigService } from '../../../config/configuration';
import { Money } from '../../../shared/domain/value-objects/money';
import { type PayoutMethodCatalogPort } from '../application/ports/payout.ports';
import { PayoutMethodCatalog } from '../domain/payout-method';

/** Catálogo desde la configuración validada (`PAYOUT_*`), mientras no haya proveedores (T5). */
@Injectable()
export class ConfigPayoutMethodCatalog implements PayoutMethodCatalogPort {
  private readonly catalog: PayoutMethodCatalog;

  constructor(@Inject(ConfigService) env: AppConfigService) {
    const unavailable = env.get('PAYOUT_METHODS_UNAVAILABLE', { infer: true });
    const noCharge = env.get('PAYOUT_METHODS_NO_CHARGE', { infer: true });
    const currency = env.get('DEFAULT_CURRENCY', { infer: true });
    this.catalog = PayoutMethodCatalog.create(
      env.get('PAYOUT_METHODS', { infer: true }).map((type) => ({
        type,
        available: !unavailable.includes(type),
        badges: noCharge.includes(type) ? ['no_charge'] : [],
        limit:
          type === 'prepaid_card'
            ? Money.of(env.get('PAYOUT_PREPAID_CARD_LIMIT', { infer: true }), currency)
            : null,
      })),
    );
  }

  forUser(): Promise<PayoutMethodCatalog> {
    return Promise.resolve(this.catalog);
  }
}
