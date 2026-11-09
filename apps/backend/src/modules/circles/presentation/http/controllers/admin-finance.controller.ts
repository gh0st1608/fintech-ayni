import { Controller, Get, Inject, Query, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type StaffRole } from '../../../../../shared/application/ports/staff-authenticator.port';
import { Public } from '../../../../../shared/presentation/decorators/public.decorator';
import { RequireStaff, StaffGuard } from '../../../../../shared/presentation/guards/staff.guard';
import {
  GetGuaranteeFundUseCase,
  ListInstallmentsUseCase,
  ListPayoutsUseCase,
} from '../../../application/use-cases/admin-finance.use-cases';
import {
  FinancePageQuery,
  FundBalanceResponse,
  FundMovementResponse,
  GuaranteeFundResponse,
  InstallmentResponse,
  InstallmentsQuery,
  InstallmentsResponse,
  PayoutResponse,
  PayoutsResponse,
} from '../dto/admin-finance.dto';

/** Quién ve el dinero (matriz de docs/backoffice-plan.md §5). */
const FINANCE_READERS: readonly StaffRole[] = ['finance', 'super_admin'];
const DEFAULT_PAGE_SIZE = 25;

/**
 * Finanzas del back-office (docs/backoffice-plan.md, fase 3), **solo lectura**: cuotas, pozos y el
 * fondo de garantía. Registrar el capital semilla o una corrección espera la doble aprobación (BO6).
 */
@ApiTags('admin')
@ApiBearerAuth()
@Public()
@UseGuards(StaffGuard)
@Controller({ path: 'admin/v1/finance', version: VERSION_NEUTRAL })
export class AdminFinanceController {
  constructor(
    @Inject(ListInstallmentsUseCase) private readonly listInstallments: ListInstallmentsUseCase,
    @Inject(ListPayoutsUseCase) private readonly listPayouts: ListPayoutsUseCase,
    @Inject(GetGuaranteeFundUseCase) private readonly getFund: GetGuaranteeFundUseCase,
  ) {}

  @Get('installments')
  @RequireStaff(FINANCE_READERS)
  @ApiOkResponse({
    type: InstallmentsResponse,
    description: 'Envuelto. Del vencimiento más reciente al más antiguo, con totales por estado',
  })
  @ApiBadRequestResponse({ description: 'status, period, limit o cursor inválidos' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no ve finanzas (FORBIDDEN)' })
  async installments(@Query() query: InstallmentsQuery): Promise<InstallmentsResponse> {
    const { totals, page } = await this.listInstallments.execute({
      status: query.status,
      period: query.period,
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      cursor: query.cursor ?? null,
    });
    return {
      totals: totals.map(({ status, count, total }) => ({
        status,
        count,
        total: { amount: total.amount, currency: total.currency },
      })),
      items: page.items.map((item) => InstallmentResponse.from(item)),
      nextCursor: page.nextCursor,
    };
  }

  @Get('payouts')
  @RequireStaff(FINANCE_READERS)
  @ApiOkResponse({
    type: PayoutsResponse,
    description: 'Envuelto. Del más reciente al más antiguo',
  })
  @ApiBadRequestResponse({ description: 'limit o cursor inválidos' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no ve finanzas (FORBIDDEN)' })
  async payouts(@Query() query: FinancePageQuery): Promise<PayoutsResponse> {
    const page = await this.listPayouts.execute({
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      cursor: query.cursor ?? null,
    });
    return {
      items: page.items.map((item) => PayoutResponse.from(item)),
      nextCursor: page.nextCursor,
    };
  }

  @Get('guarantee-fund')
  @RequireStaff(FINANCE_READERS)
  @ApiOkResponse({
    type: GuaranteeFundResponse,
    description: 'Envuelto. Saldo por moneda con su mínimo, y los movimientos',
  })
  @ApiBadRequestResponse({ description: 'limit o cursor inválidos' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no ve finanzas (FORBIDDEN)' })
  async guaranteeFund(@Query() query: FinancePageQuery): Promise<GuaranteeFundResponse> {
    const { balances, movements } = await this.getFund.execute({
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      cursor: query.cursor ?? null,
    });
    return {
      balances: balances.map((balance) => FundBalanceResponse.from(balance)),
      items: movements.items.map((movement) => FundMovementResponse.from(movement)),
      nextCursor: movements.nextCursor,
    };
  }
}
