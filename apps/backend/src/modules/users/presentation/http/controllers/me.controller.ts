import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type Principal } from '../../../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../../../shared/presentation/decorators/current-principal.decorator';
import { GetMyProfileUseCase } from '../../../application/use-cases/get-my-profile.use-case';
import { UpdatePreferredLanguageUseCase } from '../../../application/use-cases/update-preferred-language.use-case';
import { MeResponse, UpdateMeRequest } from '../dto/me.dto';

@ApiTags('me')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(
    @Inject(UpdatePreferredLanguageUseCase)
    private readonly updatePreferredLanguage: UpdatePreferredLanguageUseCase,
    @Inject(GetMyProfileUseCase) private readonly getMyProfile: GetMyProfileUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: MeResponse, description: 'Envuelto en { success, data, traceId }' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  @ApiNotFoundResponse({ description: 'El usuario del token ya no existe (USER_NOT_FOUND)' })
  async me(@CurrentPrincipal() principal: Principal): Promise<MeResponse> {
    return MeResponse.from(await this.getMyProfile.execute(principal));
  }

  @Patch()
  @ApiOkResponse({ type: MeResponse, description: 'Envuelto en { success, data, traceId }' })
  @ApiBadRequestResponse({ description: 'Código de idioma inválido (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async update(
    @CurrentPrincipal() principal: Principal,
    @Body() body: UpdateMeRequest,
  ): Promise<MeResponse> {
    const user = await this.updatePreferredLanguage.execute(principal, body.preferredLanguage);
    return MeResponse.from(await this.getMyProfile.profileOf(user));
  }
}
