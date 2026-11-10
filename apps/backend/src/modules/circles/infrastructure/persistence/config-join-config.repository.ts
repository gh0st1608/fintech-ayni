import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfigService } from '../../../../config/configuration';
import {
  CURRENCIES,
  type CurrencySettings,
} from '../../../../shared/application/ports/currencies.port';
import { Money } from '../../../../shared/domain/value-objects/money';
import {
  CurrencyNotSupportedError,
  type JoinConfigRepositoryPort,
} from '../../application/ports/join-config-repository.port';
import { JoinConfig } from '../../domain/entities/join-config';
import { PayoutRange } from '../../domain/value-objects/payout-range';

/**
 * Montos de unión desde la configuración validada, mientras no exista base de datos
 * (spike COPAYNI-11). Se construye al arrancar: un rango inválido impide iniciar la API.
 * Todavía no hay límite por usuario (pending-scope R5): `userPayoutLimit` es null.
 *
 * Los montos se configuran en la moneda oficial; los de cada otra moneda admitida son sus
 * equivalentes con el tipo de cambio fijo (pending-scope M6).
 */
@Injectable()
export class ConfigJoinConfigRepository implements JoinConfigRepositoryPort {
  private readonly official: string;
  private readonly byCurrency: ReadonlyMap<string, JoinConfig>;

  constructor(
    @Inject(ConfigService) config: AppConfigService,
    @Inject(CURRENCIES) currencies: CurrencySettings,
  ) {
    this.official = currencies.official;
    const money = (amount: number) => Money.of(amount, currencies.official);
    const base = JoinConfig.create({
      payoutRange: PayoutRange.create({
        min: money(config.get('JOIN_PAYOUT_MIN', { infer: true })),
        max: money(config.get('JOIN_PAYOUT_MAX', { infer: true })),
        step: money(config.get('JOIN_PAYOUT_STEP', { infer: true })),
      }),
      savingProgramMax: money(config.get('SAVING_PROGRAM_MAX', { infer: true })),
      userPayoutLimit: null,
      durationOptions: config.get('CIRCLE_DURATION_OPTIONS', { infer: true }),
    });
    this.byCurrency = new Map(
      currencies.supported.map((currency) => [
        currency,
        base.convertedTo(currency, currencies.rates),
      ]),
    );
  }

  getForUser(_userId: string, currency: string = this.official): Promise<JoinConfig> {
    const config = this.byCurrency.get(currency);
    if (!config) return Promise.reject(new CurrencyNotSupportedError());
    return Promise.resolve(config);
  }
}
