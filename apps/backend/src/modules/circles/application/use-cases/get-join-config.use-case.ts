import { Inject, Injectable } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import {
  CURRENCIES,
  type CurrencySettings,
} from '../../../../shared/application/ports/currencies.port';
import { type JoinConfig } from '../../domain/entities/join-config';
import {
  JOIN_CONFIG_REPOSITORY,
  type JoinConfigRepositoryPort,
} from '../ports/join-config-repository.port';

/** Una moneda que el usuario puede elegir, con su tipo de cambio frente a la oficial. */
export interface CurrencyOption {
  code: string;
  official: boolean;
  /** Unidades de la moneda oficial por unidad de esta (`3.75`); `1` en la oficial. */
  rateToOfficial: string;
}

export interface JoinConfigView {
  config: JoinConfig;
  currencies: CurrencyOption[];
}

/**
 * Montos permitidos para unirse a un Game'ya o al programa de ahorro (COPAYNI-27, 28), en la
 * moneda pedida o en la oficial, y las monedas habilitadas para elegir (pending-scope M2).
 */
@Injectable()
export class GetJoinConfigUseCase {
  constructor(
    @Inject(JOIN_CONFIG_REPOSITORY)
    private readonly joinConfigs: JoinConfigRepositoryPort,
    @Inject(CURRENCIES) private readonly currencies: CurrencySettings,
  ) {}

  async execute(principal: Principal, currency?: string): Promise<JoinConfigView> {
    const config = await this.joinConfigs.getForUser(principal.userId, currency);
    const { official, supported, rates } = this.currencies;
    return {
      config,
      currencies: supported.map((code) => ({
        code,
        official: code === official,
        rateToOfficial: rates.rateOf(code),
      })),
    };
  }
}
