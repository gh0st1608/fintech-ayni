import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { type Money } from '../../../../shared/domain/value-objects/money';

export const DELINQUENCY_QUERY = Symbol('DELINQUENCY_QUERY');
export const DELINQUENCY_SETTINGS = Symbol('DELINQUENCY_SETTINGS');

/** Vistas de la mora (COPAYNI-94): quién está en gracia, expulsados, deudas y devoluciones. */
export const DELINQUENCY_VIEWS = ['grace', 'expelled', 'debts', 'refunds'] as const;
export type DelinquencyView = (typeof DELINQUENCY_VIEWS)[number];

export interface DelinquencySettings {
  readonly graceDays: number;
  readonly timeZone: string;
}

export interface DelinquencyItem {
  /** La cuota (gracia) o la expulsión (las demás vistas). */
  id: string;
  circleId: string;
  member: { userId: string; name: string | null };
  /** `YYYY-MM` del mes de la cuota o de la expulsión. */
  period: string;
  /** Vencimiento (gracia) o fecha de expulsión, `YYYY-MM-DD`. */
  date: string;
  /** Cuota vencida, deuda vencida o devolución, según la vista. */
  amount: Money;
  /** Cargo por mora de la deuda; `null` en las demás vistas. */
  lateFee: Money | null;
  /** Cuándo se saldó la deuda o se pagó la devolución; `null` si sigue pendiente. */
  settledAt: Date | null;
  /** Último día de gracia (solo la vista de gracia). */
  graceEndsOn: string | null;
}

export interface DelinquencyPage {
  items: DelinquencyItem[];
  nextCursor: string | null;
  /** Lo pendiente (monto más cargo) por moneda, en toda la vista. */
  pending: Money[];
}

export interface DelinquencyQueryPort {
  list(filter: {
    view: DelinquencyView;
    today: string;
    graceDays: number;
    limit: number;
    cursor: string | null;
  }): Promise<DelinquencyPage>;
}

/**
 * `GET /admin/v1/delinquency?view=` (COPAYNI-94, fase 3 del back-office): solo lectura. La mora
 * de COPAYNI-57 (gracia, expulsión, deuda con cargo y devolución) a la vista del personal.
 */
@Injectable()
export class ListDelinquencyUseCase {
  constructor(
    @Inject(DELINQUENCY_QUERY) private readonly query: DelinquencyQueryPort,
    @Inject(DELINQUENCY_SETTINGS) private readonly settings: DelinquencySettings,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  execute(filter: {
    view: DelinquencyView;
    limit: number;
    cursor: string | null;
  }): Promise<DelinquencyPage> {
    return this.query.list({
      ...filter,
      today: LocalDate.fromDate(this.clock.now(), this.settings.timeZone).toString(),
      graceDays: this.settings.graceDays,
    });
  }
}
