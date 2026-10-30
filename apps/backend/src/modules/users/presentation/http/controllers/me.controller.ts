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
import { ValidationError } from '../../../../../shared/errors/app-error';
import { CurrentPrincipal } from '../../../../../shared/presentation/decorators/current-principal.decorator';
import { GetMyProfileUseCase } from '../../../application/use-cases/get-my-profile.use-case';
import { UpdatePersonalInfoUseCase } from '../../../application/use-cases/update-personal-info.use-case';
import { MeResponse, UpdateMeRequest } from '../dto/me.dto';

@ApiTags('me')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(
    @Inject(UpdatePersonalInfoUseCase)
    private readonly updatePersonalInfo: UpdatePersonalInfoUseCase,
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
  @ApiBadRequestResponse({
    description: 'Cuerpo vacío, idioma o nombre inválidos, o campos de más (VALIDATION_ERROR)',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async update(
    @CurrentPrincipal() principal: Principal,
    @Body() body: UpdateMeRequest,
  ): Promise<MeResponse> {
    if (Object.values(body).every((value) => value === undefined)) {
      throw new ValidationError('Envía al menos un campo', { body: 'empty' });
    }
    const user = await this.updatePersonalInfo.execute(principal, body);
    return MeResponse.from(await this.getMyProfile.profileOf(user));
  }
}
