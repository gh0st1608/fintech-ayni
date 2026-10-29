import { Body, Controller, Get, Inject, Patch, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type Principal } from '../../../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../../../shared/presentation/decorators/current-principal.decorator';
import { GetPaymentSummaryUseCase } from '../../../application/use-cases/get-payment-summary.use-case';
import { GetPayoutEligibilityUseCase } from '../../../application/use-cases/get-payout-eligibility.use-case';
import { ListTransactionsUseCase } from '../../../application/use-cases/list-transactions.use-case';
import {
  GetPaymentSettingsUseCase,
  UpdatePaymentSettingsUseCase,
} from '../../../application/use-cases/payment-settings.use-cases';
import { PaymentSettingsResponse, UpdatePaymentSettingsRequest } from '../dto/payment-settings.dto';
import { PaymentSummaryResponse } from '../dto/payment-summary.dto';
import { PayoutEligibilityResponse } from '../dto/payout-eligibility.dto';
import { TransactionsQuery, TransactionsResponse } from '../dto/transactions.dto';

/** Sección Payment de la app (COPAYNI-35, 36, 38 y 41, docs/api/payments.md). */
@ApiTags('payments')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class MyPaymentsController {
  constructor(
    @Inject(GetPaymentSummaryUseCase) private readonly getSummary: GetPaymentSummaryUseCase,
    @Inject(ListTransactionsUseCase) private readonly listTransactions: ListTransactionsUseCase,
    @Inject(GetPayoutEligibilityUseCase)
    private readonly getEligibility: GetPayoutEligibilityUseCase,
    @Inject(GetPaymentSettingsUseCase) private readonly getSettings: GetPaymentSettingsUseCase,
    @Inject(UpdatePaymentSettingsUseCase)
    private readonly updateSettings: UpdatePaymentSettingsUseCase,
  ) {}

  @Get('payment-settings')
  @ApiOkResponse({
    type: PaymentSettingsResponse,
    description: 'Envuelto en { success, data, traceId }',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async paymentSettings(
    @CurrentPrincipal() principal: Principal,
  ): Promise<PaymentSettingsResponse> {
    return PaymentSettingsResponse.from(await this.getSettings.execute(principal));
  }

  @Patch('payment-settings')
  @ApiOkResponse({
    type: PaymentSettingsResponse,
    description: 'Envuelto en { success, data, traceId }',
  })
  @ApiBadRequestResponse({
    description: 'deductPayInFromPayout ausente o no booleano (VALIDATION_ERROR)',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async updatePaymentSettings(
    @CurrentPrincipal() principal: Principal,
    @Body() body: UpdatePaymentSettingsRequest,
  ): Promise<PaymentSettingsResponse> {
    return PaymentSettingsResponse.from(
      await this.updateSettings.execute(principal, {
        deductPayInFromPayout: body.deductPayInFromPayout,
      }),
    );
  }

  @Get('payout-eligibility')
  @ApiOkResponse({
    type: PayoutEligibilityResponse,
    description: 'Envuelto en { success, data, traceId }',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async payoutEligibility(
    @CurrentPrincipal() principal: Principal,
  ): Promise<PayoutEligibilityResponse> {
    return PayoutEligibilityResponse.from(await this.getEligibility.execute(principal));
  }

  @Get('transactions')
  @ApiOkResponse({
    type: TransactionsResponse,
    description: 'Envuelto en { success, data, traceId }',
  })
  @ApiBadRequestResponse({
    description:
      'type ausente o inválido, limit fuera de 1-50 o cursor inválido (VALIDATION_ERROR)',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async transactions(
    @CurrentPrincipal() principal: Principal,
    @Query() query: TransactionsQuery,
  ): Promise<TransactionsResponse> {
    return TransactionsResponse.from(
      await this.listTransactions.execute(principal, {
        type: query.type,
        cursor: query.cursor ?? null,
        limit: query.limit,
      }),
    );
  }

  @Get('payments/summary')
  @ApiOkResponse({
    type: PaymentSummaryResponse,
    description: 'Envuelto en { success, data, traceId }',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async summary(@CurrentPrincipal() principal: Principal): Promise<PaymentSummaryResponse> {
    return PaymentSummaryResponse.from(await this.getSummary.execute(principal));
  }
}
