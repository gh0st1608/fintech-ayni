import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { type Principal } from '../../../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../../../shared/presentation/decorators/current-principal.decorator';
import { GetPaymentSummaryUseCase } from '../../../application/use-cases/get-payment-summary.use-case';
import { PaymentSummaryResponse } from '../dto/payment-summary.dto';

/** Sección Payment de la app (COPAYNI-35, docs/api/payments.md). */
@ApiTags('payments')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class MyPaymentsController {
  constructor(
    @Inject(GetPaymentSummaryUseCase) private readonly getSummary: GetPaymentSummaryUseCase,
  ) {}

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
