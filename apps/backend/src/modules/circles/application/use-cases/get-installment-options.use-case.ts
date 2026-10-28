import { Inject, Injectable } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { Money } from '../../../../shared/domain/value-objects/money';
import { DomainError } from '../../../../shared/errors/app-error';
import {
  type InstallmentOption,
  installmentOptions,
} from '../../domain/services/installment-options';
import {
  JOIN_CONFIG_REPOSITORY,
  type JoinConfigRepositoryPort,
} from '../ports/join-config-repository.port';

export class PayoutNotAllowedError extends DomainError {
  constructor() {
    super(
      'PAYOUT_NOT_ALLOWED',
      'El monto de payout está fuera del rango permitido o no coincide con un salto del slider',
    );
  }
}

export interface InstallmentOptionsResult {
  payout: Money;
  options: InstallmentOption[];
}

/** Cuotas y duraciones posibles para el payout elegido (Monthly Pay-in, COPAYNI-29). */
@Injectable()
export class GetInstallmentOptionsUseCase {
  constructor(
    @Inject(JOIN_CONFIG_REPOSITORY)
    private readonly joinConfigs: JoinConfigRepositoryPort,
  ) {}

  async execute(principal: Principal, payoutAmount: number): Promise<InstallmentOptionsResult> {
    const joinConfig = await this.joinConfigs.getForUser(principal.userId);
    const payout = Money.of(payoutAmount, joinConfig.payoutRange.currency);
    if (!joinConfig.allowsPayout(payout)) throw new PayoutNotAllowedError();
    return { payout, options: installmentOptions(payout, joinConfig.durationOptions) };
  }
}
