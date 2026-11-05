import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { type Principal } from '../../../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../../../shared/presentation/decorators/current-principal.decorator';
import {
  GetPasscodeStatusUseCase,
  SetPasscodeUseCase,
  VerifyPasscodeUseCase,
} from '../../../application/use-cases/passcode.use-cases';
import {
  PasscodeStatusResponse,
  SetPasscodeRequest,
  VerifyPasscodeRequest,
} from '../dto/passcode.dto';

/** Passcode de acceso (COPAYNI-23, docs/api/me.md). */
@ApiTags('me')
@ApiBearerAuth()
@Controller({ path: 'me/passcode', version: '1' })
export class PasscodeController {
  constructor(
    @Inject(GetPasscodeStatusUseCase) private readonly status: GetPasscodeStatusUseCase,
    @Inject(SetPasscodeUseCase) private readonly setPasscode: SetPasscodeUseCase,
    @Inject(VerifyPasscodeUseCase) private readonly verifyPasscode: VerifyPasscodeUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: PasscodeStatusResponse, description: 'Envuelto en { success, data }' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  get(@CurrentPrincipal() principal: Principal): Promise<PasscodeStatusResponse> {
    return this.status.execute(principal);
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Passcode creado o cambiado' })
  @ApiBadRequestResponse({ description: 'Formato inválido o campos de más (VALIDATION_ERROR)' })
  @ApiUnprocessableEntityResponse({ description: 'El actual es incorrecto (PASSCODE_INVALID)' })
  @ApiTooManyRequestsResponse({ description: 'RATE_LIMITED, con Retry-After en segundos' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async set(
    @CurrentPrincipal() principal: Principal,
    @Body() body: SetPasscodeRequest,
  ): Promise<void> {
    await this.setPasscode.execute(principal, body);
  }

  @Post('verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Passcode correcto' })
  @ApiBadRequestResponse({ description: 'Formato inválido o campos de más (VALIDATION_ERROR)' })
  @ApiUnprocessableEntityResponse({ description: 'PASSCODE_INVALID o PASSCODE_NOT_SET' })
  @ApiTooManyRequestsResponse({ description: 'RATE_LIMITED, con Retry-After en segundos' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async verify(
    @CurrentPrincipal() principal: Principal,
    @Body() body: VerifyPasscodeRequest,
  ): Promise<void> {
    await this.verifyPasscode.execute(principal, body.passcode);
  }
}
