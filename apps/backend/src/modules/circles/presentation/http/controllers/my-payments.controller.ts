import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
import { PayInstallmentUseCase } from '../../../application/use-cases/pay-installment.use-cases';
import { ValidationError } from '../../../../../shared/errors/app-error';
import { PayInstallmentRequest, PayInstallmentResponse } from '../dto/pay-installment.dto';
import {
  GetPaymentSettingsUseCase,
  UpdatePaymentSettingsUseCase,
} from '../../../application/use-cases/payment-settings.use-cases';
import { PaymentSettingsResponse, UpdatePaymentSettingsRequest } from '../dto/payment-settings.dto';
import { PaymentSummaryResponse } from '../dto/payment-summary.dto';
import { PayoutEligibilityResponse } from '../dto/payout-eligibility.dto';
import { TransactionsQuery, TransactionsResponse } from '../dto/transactions.dto';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,255}$/;
const INSTALLMENT_ID = new ParseUUIDPipe({
  exceptionFactory: () =>
    new ValidationError('El id de la cuota debe ser un UUID', { id: 'invalid' }),
});

/** Sección Payment de la app (COPAYNI-35, 36, 38, 41 y 63, docs/api/payments.md). */
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
    @Inject(PayInstallmentUseCase) private readonly payInstallment: PayInstallmentUseCase,
  ) {}

  @Post('installments/:id/pay')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: PayInstallmentResponse,
    description: 'Envuelto en { success, data, traceId }',
  })
  @ApiBadRequestResponse({
    description: 'Cuerpo, id o Idempotency-Key inválidos (VALIDATION_ERROR)',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async pay(
    @CurrentPrincipal() principal: Principal,
    @Param('id', INSTALLMENT_ID) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: PayInstallmentRequest,
  ): Promise<PayInstallmentResponse> {
    if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new ValidationError('Falta Idempotency-Key o no es válida', {
        'Idempotency-Key': 'invalid',
      });
    }
    const method =
      body.method === 'yape'
        ? { type: 'yape' as const, token: body.token! }
        : { type: 'card' as const, cardId: body.cardId! };
    return PayInstallmentResponse.from(
      await this.payInstallment.execute(principal, { installmentId: id, idempotencyKey, method }),
    );
  }

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
