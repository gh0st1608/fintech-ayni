import { Inject, Injectable } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { Money } from '../../../../shared/domain/value-objects/money';
import { DomainError } from '../../../../shared/errors/app-error';
import { requestedCadence } from '../../domain/services/client-capability';
import {
  type InstallmentOption,
  installmentOptions,
  type NearestOffer,
  nearestOffers,
} from '../../domain/services/installment-options';
import { Cadence, type CadenceId } from '../../domain/value-objects/cadence';
import {
  JOIN_CONFIG_REPOSITORY,
  type JoinConfigRepositoryPort,
} from '../ports/join-config-repository.port';
import { CIRCLE_ASSIGNMENT, type CircleAssignmentSettings } from './assignment-settings';

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
  /** La cadencia en la que se calcularon las opciones. */
  cadence: CadenceId;
  options: InstallmentOption[];
  /**
   * Montos cercanos que sí admiten alguna duración. Va con `options` vacío (COPAYNI-125) y en
   * otro caso queda vacío.
   */
  alternatives: NearestOffer[];
}

/** Cuotas y duraciones posibles para el payout elegido (Monthly Pay-in, COPAYNI-29). */
@Injectable()
export class GetInstallmentOptionsUseCase {
  constructor(
    @Inject(JOIN_CONFIG_REPOSITORY)
    private readonly joinConfigs: JoinConfigRepositoryPort,
    @Inject(CIRCLE_ASSIGNMENT)
    private readonly assignment: Pick<CircleAssignmentSettings, 'cadences'>,
  ) {}

  async execute(
    principal: Principal,
    payoutAmount: number,
    currency?: string,
    /** Frecuencia pedida; la mensual si no se indica (COPAYNI-116). */
    cadenceId?: CadenceId,
    /** Cadencias que el cliente declara soportar (COPAYNI-115). */
    supported: readonly Cadence[] = [Cadence.default],
  ): Promise<InstallmentOptionsResult> {
    const cadence = requestedCadence(cadenceId, this.assignment.cadences, supported);
    const joinConfig = await this.joinConfigs.getForUser(principal.userId, currency);
    const payout = Money.of(payoutAmount, joinConfig.payoutRange.currency);
    if (!joinConfig.allowsPayout(payout)) throw new PayoutNotAllowedError();

    const options = installmentOptions(payout, joinConfig.turnOptions, cadence);
    return {
      payout,
      cadence: cadence.id,
      options,
      // Un monto válido del slider sin ninguna duración exacta no se responde con una lista
      // vacía a secas: el usuario no tiene por qué deducir que el problema es la divisibilidad.
      alternatives:
        options.length > 0
          ? []
          : nearestOffers(payout, joinConfig.payoutRange, joinConfig.turnOptions, cadence),
    };
  }
}
