import { Inject, Injectable } from '@nestjs/common';

import { maskName } from '../../../../shared/domain/services/mask-pii';
import { type Money } from '../../../../shared/domain/value-objects/money';
import { ValidationError } from '../../../../shared/errors/app-error';
import {
  ADMIN_FINANCE_QUERY,
  type AdminFinanceQueryPort,
  type AdminInstallment,
  type AdminPayout,
  type FinanceMember,
  type FundMovement,
  type InstallmentsFilter,
  type Page,
} from '../ports/admin-finance-query.port';
import { GUARANTEE_FUND, type GuaranteeFundPort } from '../ports/guarantee-fund.port';
import {
  GUARANTEE_FUND_SETTINGS,
  type GuaranteeFundSettings,
} from './check-guarantee-fund.use-case';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/** La persona como la ve finanzas: su id y el nombre enmascarado. Sin email ni teléfono. */
export interface MaskedMember {
  userId: string;
  name: string | null;
}

const mask = (member: FinanceMember): MaskedMember => ({
  userId: member.userId,
  name: maskName(member.firstName, member.lastName),
});

function assertPeriod(period: string | undefined): void {
  if (period !== undefined && !PERIOD.test(period)) {
    throw new ValidationError('El periodo debe tener la forma AAAA-MM', { period: 'invalid' });
  }
}

export type InstallmentView = Omit<AdminInstallment, 'member'> & { member: MaskedMember };
export type PayoutView = Omit<AdminPayout, 'member'> & { member: MaskedMember };

/**
 * `GET /admin/v1/finance/installments`: cuotas por estado y mes, con el resumen por estado. Solo
 * lectura (docs/backoffice-plan.md, fase 3): los movimientos manuales esperan la doble aprobación
 * (BO6).
 */
@Injectable()
export class ListInstallmentsUseCase {
  constructor(@Inject(ADMIN_FINANCE_QUERY) private readonly finance: AdminFinanceQueryPort) {}

  async execute(filter: InstallmentsFilter): Promise<{
    totals: Awaited<ReturnType<AdminFinanceQueryPort['installmentTotals']>>;
    page: Page<InstallmentView>;
  }> {
    assertPeriod(filter.period);
    const [totals, page] = await Promise.all([
      this.finance.installmentTotals(filter.period),
      this.finance.installments(filter),
    ]);
    return {
      totals,
      page: {
        items: page.items.map((item) => ({ ...item, member: mask(item.member) })),
        nextCursor: page.nextCursor,
      },
    };
  }
}

/** `GET /admin/v1/finance/payouts`: pozos entregados, del más reciente al más antiguo. */
@Injectable()
export class ListPayoutsUseCase {
  constructor(@Inject(ADMIN_FINANCE_QUERY) private readonly finance: AdminFinanceQueryPort) {}

  async execute(filter: { limit: number; cursor: string | null }): Promise<Page<PayoutView>> {
    const page = await this.finance.payouts(filter);
    return {
      items: page.items.map((item) => ({ ...item, member: mask(item.member) })),
      nextCursor: page.nextCursor,
    };
  }
}

export interface FundBalanceView {
  balance: Money;
  activeCircles: number;
  /** Saldo mínimo esperado: N cuotas base por círculo en curso (R18). */
  minimum: Money;
  belowMinimum: boolean;
}

/**
 * `GET /admin/v1/finance/guarantee-fund`: saldo por moneda con su mínimo, y los movimientos del
 * registro contable (solo inserción), del más reciente al más antiguo.
 */
@Injectable()
export class GetGuaranteeFundUseCase {
  constructor(
    @Inject(GUARANTEE_FUND) private readonly fund: GuaranteeFundPort,
    @Inject(GUARANTEE_FUND_SETTINGS) private readonly settings: GuaranteeFundSettings,
    @Inject(ADMIN_FINANCE_QUERY) private readonly finance: AdminFinanceQueryPort,
  ) {}

  async execute(filter: {
    limit: number;
    cursor: string | null;
  }): Promise<{ balances: FundBalanceView[]; movements: Page<FundMovement> }> {
    const [statuses, movements] = await Promise.all([
      this.fund.status(),
      this.finance.fundMovements(filter),
    ]);
    return {
      balances: statuses.map((status) => {
        const minimum = status.activeBaseInstallments.times(this.settings.minInstallmentsPerCircle);
        return {
          balance: status.balance,
          activeCircles: status.activeCircles,
          minimum,
          belowMinimum: status.balance.amount < minimum.amount,
        };
      }),
      movements,
    };
  }
}
