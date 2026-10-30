import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { type Principal } from '../../../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../../../shared/presentation/decorators/current-principal.decorator';
import { GetMyProfileUseCase } from '../../../../users/application/use-cases/get-my-profile.use-case';
import { MeResponse } from '../../../../users/presentation/http/dto/me.dto';
import {
  StartContactChangeUseCase,
  VerifyContactChangeUseCase,
} from '../../../application/use-cases/contact-change.use-cases';
import { AuthChallengeResponse, StartAuthRequest, VerifyOtpRequest } from '../dto/auth.dto';

/** Cambio de email o teléfono verificado por OTP (COPAYNI-45, supuesto R9; docs/api/me.md). */
@ApiTags('me')
@ApiBearerAuth()
@Controller({ path: 'me/contact', version: '1' })
export class ContactChangeController {
  constructor(
    @Inject(StartContactChangeUseCase) private readonly startChange: StartContactChangeUseCase,
    @Inject(VerifyContactChangeUseCase) private readonly verifyChange: VerifyContactChangeUseCase,
    @Inject(GetMyProfileUseCase) private readonly profiles: GetMyProfileUseCase,
  ) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: AuthChallengeResponse,
    description: 'Envuelto. OTP enviado al dato nuevo',
  })
  @ApiBadRequestResponse({ description: 'Formato inválido o el mismo dato (VALIDATION_ERROR)' })
  @ApiTooManyRequestsResponse({ description: 'RATE_LIMITED, con Retry-After en segundos' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async start(
    @CurrentPrincipal() principal: Principal,
    @Body() body: StartAuthRequest,
  ): Promise<AuthChallengeResponse> {
    return AuthChallengeResponse.from(await this.startChange.execute(principal, body));
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MeResponse, description: 'Envuelto. El perfil con el dato nuevo' })
  @ApiUnprocessableEntityResponse({
    description: 'OTP_INVALID, OTP_EXPIRED u OTP_ATTEMPTS_EXCEEDED',
  })
  @ApiConflictResponse({ description: 'Otra cuenta ya tiene ese dato (CONTACT_TAKEN)' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async verify(
    @CurrentPrincipal() principal: Principal,
    @Body() body: VerifyOtpRequest,
  ): Promise<MeResponse> {
    const user = await this.verifyChange.execute(principal, body);
    return MeResponse.from(await this.profiles.profileOf(user));
  }
}
