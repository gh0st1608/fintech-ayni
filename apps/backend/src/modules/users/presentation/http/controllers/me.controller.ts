import { Body, Controller, Inject, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type Principal } from '../../../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../../../shared/presentation/decorators/current-principal.decorator';
import { UpdatePreferredLanguageUseCase } from '../../../application/use-cases/update-preferred-language.use-case';
import { MeResponse, UpdateMeRequest } from '../dto/me.dto';

@ApiTags('me')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(
    @Inject(UpdatePreferredLanguageUseCase)
    private readonly updatePreferredLanguage: UpdatePreferredLanguageUseCase,
  ) {}

  @Patch()
  @ApiOkResponse({ type: MeResponse, description: 'Envuelto en { success, data, traceId }' })
  @ApiBadRequestResponse({ description: 'Código de idioma inválido (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async update(
    @CurrentPrincipal() principal: Principal,
    @Body() body: UpdateMeRequest,
  ): Promise<MeResponse> {
    return MeResponse.from(
      await this.updatePreferredLanguage.execute(principal, body.preferredLanguage),
    );
  }
}
