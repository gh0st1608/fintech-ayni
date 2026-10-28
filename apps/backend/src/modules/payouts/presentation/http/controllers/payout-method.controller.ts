import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { type Principal } from '../../../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../../../shared/presentation/decorators/current-principal.decorator';
import {
  ListPayoutMethodsUseCase,
  SelectPayoutMethodUseCase,
} from '../../../application/use-cases/payout-method.use-cases';
import { PayoutMethodsResponse, SelectPayoutMethodRequest } from '../dto/payout-method.dto';

const ENVELOPE = 'Envuelto en { success, data, traceId }';

@ApiTags('payouts')
@ApiBearerAuth()
@Controller({ path: 'me/payout-method', version: '1' })
export class PayoutMethodController {
  constructor(
    @Inject(ListPayoutMethodsUseCase) private readonly listMethods: ListPayoutMethodsUseCase,
    @Inject(SelectPayoutMethodUseCase) private readonly selectMethod: SelectPayoutMethodUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: PayoutMethodsResponse, description: ENVELOPE })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async list(@CurrentPrincipal() principal: Principal): Promise<PayoutMethodsResponse> {
    return PayoutMethodsResponse.from(await this.listMethods.execute(principal));
  }

  @Put()
  @ApiOkResponse({ type: PayoutMethodsResponse, description: ENVELOPE })
  @ApiUnprocessableEntityResponse({
    description: 'PAYOUT_METHOD_NOT_AVAILABLE o PAYOUT_METHOD_CHANGE_NOT_ALLOWED (mes de payout)',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async select(
    @CurrentPrincipal() principal: Principal,
    @Body() body: SelectPayoutMethodRequest,
  ): Promise<PayoutMethodsResponse> {
    return PayoutMethodsResponse.from(await this.selectMethod.execute(principal, body.method));
  }
}
