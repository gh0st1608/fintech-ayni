import { Inject, Injectable } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import {
  CURRENCIES,
  type CurrencySettings,
} from '../../../../shared/application/ports/currencies.port';
import { type JoinConfig } from '../../domain/entities/join-config';
import { Cadence, type CadenceId } from '../../domain/value-objects/cadence';
import {
  JOIN_CONFIG_REPOSITORY,
  type JoinConfigRepositoryPort,
} from '../ports/join-config-repository.port';
import { CIRCLE_ASSIGNMENT, type CircleAssignmentSettings } from './assignment-settings';

/** Una moneda que el usuario puede elegir, con su tipo de cambio frente a la oficial. */
export interface CurrencyOption {
  code: string;
  official: boolean;
  /** Unidades de la moneda oficial por unidad de esta (`3.75`); `1` en la oficial. */
  rateToOfficial: string;
}

/** Una frecuencia que el usuario puede elegir, con la unidad de su turno. */
export interface CadenceOption {
  id: CadenceId;
  /** Cómo se llama un turno: «Mes», «Quincena», «Semana». */
  unit: string;
  /** Días que dura un turno, aproximado en la mensual. */
  turnDays: number;
  /** true en la mensual, que es la de todas las juntas que existen. */
  default: boolean;
}

export interface JoinConfigView {
  config: JoinConfig;
  currencies: CurrencyOption[];
  /**
   * Frecuencias que se pueden elegir (COPAYNI-116): las habilitadas en el servidor **y**
   * declaradas por el cliente. Con una sola, la app no muestra el paso de frecuencia y el flujo
   * es el mensual de siempre.
   */
  cadences: CadenceOption[];
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
    @Inject(CIRCLE_ASSIGNMENT)
    private readonly assignment: Pick<CircleAssignmentSettings, 'cadences'>,
  ) {}

  async execute(
    principal: Principal,
    currency?: string,
    /** Cadencias que el cliente declara soportar (COPAYNI-115); solo la mensual por defecto. */
    supportedCadences: readonly Cadence[] = [Cadence.default],
  ): Promise<JoinConfigView> {
    const config = await this.joinConfigs.getForUser(principal.userId, currency);
    const { official, supported, rates } = this.currencies;
    return {
      config,
      currencies: supported.map((code) => ({
        code,
        official: code === official,
        rateToOfficial: rates.rateOf(code),
      })),
      // La intersección de las dos puertas: no se ofrece lo que el servidor no puede crear ni lo
      // que el cliente no sabe dibujar.
      cadences: this.assignment.cadences
        .filter((cadence) => supportedCadences.some((declared) => declared.equals(cadence)))
        .map((cadence) => ({
          id: cadence.id,
          unit: cadence.turnLabel(),
          turnDays: cadence.approximateTurnDays(),
          default: cadence.equals(Cadence.default),
        })),
    };
  }
}
