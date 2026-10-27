import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfigService } from '../../../../config/configuration';
import { Money } from '../../../../shared/domain/value-objects/money';
import { type JoinConfigRepositoryPort } from '../../application/ports/join-config-repository.port';
import { JoinConfig } from '../../domain/entities/join-config';
import { PayoutRange } from '../../domain/value-objects/payout-range';

/**
 * Montos de unión desde la configuración validada, mientras no exista base de datos
 * (spike COPAYNI-11). Se construye al arrancar: un rango inválido impide iniciar la API.
 * Todavía no hay límite por usuario (pending-scope R5): `userPayoutLimit` es null.
 */
@Injectable()
export class ConfigJoinConfigRepository implements JoinConfigRepositoryPort {
  private readonly joinConfig: JoinConfig;

  constructor(@Inject(ConfigService) config: AppConfigService) {
    const currency = config.get('DEFAULT_CURRENCY', { infer: true });
    const money = (amount: number) => Money.of(amount, currency);
    this.joinConfig = JoinConfig.create({
      payoutRange: PayoutRange.create({
        min: money(config.get('JOIN_PAYOUT_MIN', { infer: true })),
        max: money(config.get('JOIN_PAYOUT_MAX', { infer: true })),
        step: money(config.get('JOIN_PAYOUT_STEP', { infer: true })),
      }),
      savingProgramMax: money(config.get('SAVING_PROGRAM_MAX', { infer: true })),
      userPayoutLimit: null,
    });
  }

  getForUser(): Promise<JoinConfig> {
    return Promise.resolve(this.joinConfig);
  }
}
