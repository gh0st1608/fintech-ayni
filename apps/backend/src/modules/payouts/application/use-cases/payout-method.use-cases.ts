import { Inject, Injectable, Logger } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { Period } from '../../../../shared/domain/value-objects/period';
import {
  type PayoutMethod,
  PayoutMethodChangeNotAllowedError,
  type PayoutMethodType,
} from '../../domain/payout-method';
import {
  PAYOUT_METHOD_CATALOG,
  PAYOUT_METHOD_REPOSITORY,
  PAYOUT_SCHEDULE,
  PAYOUT_SETTINGS,
  type PayoutMethodCatalogPort,
  type PayoutMethodRepositoryPort,
  type PayoutSchedulePort,
  type PayoutSettings,
} from '../ports/payout.ports';

export interface PayoutMethodsView {
  methods: readonly PayoutMethod[];
  /** Método elegido, o `null` si todavía no eligió. */
  selected: PayoutMethodType | null;
}

/** `GET /v1/me/payout-method` (COPAYNI-37): catálogo y método actual, que la app preselecciona. */
@Injectable()
export class ListPayoutMethodsUseCase {
  constructor(
    @Inject(PAYOUT_METHOD_CATALOG) private readonly catalogs: PayoutMethodCatalogPort,
    @Inject(PAYOUT_METHOD_REPOSITORY) private readonly selections: PayoutMethodRepositoryPort,
  ) {}

  async execute(principal: Principal): Promise<PayoutMethodsView> {
    const [catalog, selected] = await Promise.all([
      this.catalogs.forUser(principal.userId),
      this.selections.selectedBy(principal.userId),
    ]);
    return { methods: catalog.methods, selected };
  }
}

/**
 * `PUT /v1/me/payout-method`. Regla provisional (pending-scope R8): no se cambia durante un mes
 * en que el usuario cobra, porque ese payout ya se está procesando con el método anterior.
 * Elegir el mismo método no es un cambio y siempre se acepta.
 */
@Injectable()
export class SelectPayoutMethodUseCase {
  private readonly logger = new Logger('Payouts');

  constructor(
    @Inject(PAYOUT_METHOD_CATALOG) private readonly catalogs: PayoutMethodCatalogPort,
    @Inject(PAYOUT_METHOD_REPOSITORY) private readonly selections: PayoutMethodRepositoryPort,
    @Inject(PAYOUT_SCHEDULE) private readonly schedule: PayoutSchedulePort,
    @Inject(PAYOUT_SETTINGS) private readonly settings: PayoutSettings,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(principal: Principal, type: string): Promise<PayoutMethodsView> {
    const { userId } = principal;
    const catalog = await this.catalogs.forUser(userId);
    const method = catalog.selectable(type);

    const current = await this.selections.selectedBy(userId);
    if (current !== null && current !== method.type) {
      const thisMonth = Period.fromDate(this.clock.now(), this.settings.timeZone);
      const periods = await this.schedule.payoutPeriodsOf(userId);
      if (periods.some((period) => period.equals(thisMonth))) {
        throw new PayoutMethodChangeNotAllowedError();
      }
    }

    await this.selections.select(userId, method.type);
    this.logger.log({ event: 'payouts.method_selected', userId, method: method.type });
    return { methods: catalog.methods, selected: method.type };
  }
}

/** Método elegido si sigue disponible en el catálogo; unirse a un círculo lo exige (COPAYNI-31). */
@Injectable()
export class GetSelectedPayoutMethodUseCase {
  constructor(
    @Inject(PAYOUT_METHOD_CATALOG) private readonly catalogs: PayoutMethodCatalogPort,
    @Inject(PAYOUT_METHOD_REPOSITORY) private readonly selections: PayoutMethodRepositoryPort,
  ) {}

  async execute(userId: string): Promise<PayoutMethod | null> {
    const [catalog, selected] = await Promise.all([
      this.catalogs.forUser(userId),
      this.selections.selectedBy(userId),
    ]);
    return catalog.methods.find((method) => method.type === selected && method.available) ?? null;
  }
}
