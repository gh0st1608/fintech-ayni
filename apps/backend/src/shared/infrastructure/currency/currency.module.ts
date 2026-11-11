import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfigService } from '../../../config/configuration';
import { CURRENCIES, type CurrencySettings } from '../../application/ports/currencies.port';
import { currencySettingsFrom } from './currency-settings';

/** Monedas y tipos de cambio para todos los módulos (pending-scope M2). */
@Global()
@Module({
  providers: [
    {
      provide: CURRENCIES,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): CurrencySettings =>
        currencySettingsFrom({
          DEFAULT_CURRENCY: config.get('DEFAULT_CURRENCY', { infer: true }),
          SUPPORTED_CURRENCIES: config.get('SUPPORTED_CURRENCIES', { infer: true }),
          EXCHANGE_RATES: config.get('EXCHANGE_RATES', { infer: true }),
        }),
    },
  ],
  exports: [CURRENCIES],
})
export class CurrencyModule {}
