import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { type Principal } from '../../../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../../../shared/presentation/decorators/current-principal.decorator';
import { GetPayoutAccountUseCase } from '../../../application/use-cases/payout-account.use-cases';
import { MyPayoutAccountResponse, PayoutAccountResponse } from '../dto/payout-account.dto';

/** La cuenta de cobro de la persona, de solo lectura: la registra el personal (COPAYNI-81). */
@ApiTags('payouts')
@ApiBearerAuth()
@Controller({ path: 'me/payout-account', version: '1' })
export class PayoutAccountController {
  constructor(
    @Inject(GetPayoutAccountUseCase) private readonly getAccount: GetPayoutAccountUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: MyPayoutAccountResponse, description: 'Envuelto. Enmascarada' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async get(@CurrentPrincipal() principal: Principal): Promise<MyPayoutAccountResponse> {
    const account = await this.getAccount.execute(principal.userId);
    return { account: account ? PayoutAccountResponse.from(account) : null };
  }
}
