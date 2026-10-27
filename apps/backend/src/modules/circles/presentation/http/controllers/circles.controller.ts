import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { type Principal } from '../../../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../../../shared/presentation/decorators/current-principal.decorator';
import { GetJoinConfigUseCase } from '../../../application/use-cases/get-join-config.use-case';
import { JoinConfigResponse } from '../dto/join-config.response';

@ApiTags('circles')
@ApiBearerAuth()
@Controller({ path: 'circles', version: '1' })
export class CirclesController {
  constructor(@Inject(GetJoinConfigUseCase) private readonly getJoinConfig: GetJoinConfigUseCase) {}

  @Get('join-config')
  @ApiOkResponse({
    type: JoinConfigResponse,
    description: 'Envuelto en { success, data, traceId }',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async joinConfig(@CurrentPrincipal() principal: Principal): Promise<JoinConfigResponse> {
    return JoinConfigResponse.from(await this.getJoinConfig.execute(principal));
  }
}
