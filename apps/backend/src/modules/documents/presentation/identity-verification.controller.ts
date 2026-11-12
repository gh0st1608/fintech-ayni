import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { type Principal } from '../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../shared/presentation/decorators/current-principal.decorator';
import {
  IDENTITY_SETTINGS,
  type IdentitySettings,
} from '../application/identity-verification.ports';
import {
  GetIdentityVerificationUseCase,
  StartIdentityVerificationUseCase,
} from '../application/identity-verification.use-cases';
import {
  IdentityVerificationResponse,
  StartIdentityVerificationRequest,
} from './identity-verification.dto';

/** Verificación de identidad con VerificaID (COPAYNI-42; docs/api/documents.md). */
@ApiTags('documents')
@ApiBearerAuth()
@Controller({ path: 'me/identity-verification', version: '1' })
export class IdentityVerificationController {
  constructor(
    @Inject(StartIdentityVerificationUseCase)
    private readonly start: StartIdentityVerificationUseCase,
    @Inject(GetIdentityVerificationUseCase)
    private readonly current: GetIdentityVerificationUseCase,
    @Inject(IDENTITY_SETTINGS) private readonly settings: IdentitySettings,
  ) {}

  @Get()
  @ApiOkResponse({
    type: IdentityVerificationResponse,
    description: 'Envuelto en { success, data }',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  @ApiServiceUnavailableResponse({ description: 'El proveedor no respondió (SERVICE_UNAVAILABLE)' })
  async get(@CurrentPrincipal() principal: Principal): Promise<IdentityVerificationResponse> {
    return IdentityVerificationResponse.from(
      await this.current.execute(principal),
      this.settings.consentVersion,
    );
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: IdentityVerificationResponse,
    description: 'in_progress con verificationUrl, o rejected por la validación documental',
  })
  @ApiBadRequestResponse({
    description: 'DNI inválido o consentimiento desactualizado (VALIDATION_ERROR)',
  })
  @ApiConflictResponse({
    description:
      'IDENTITY_ALREADY_VERIFIED, IDENTITY_VERIFICATION_IN_REVIEW o IDENTITY_ATTEMPTS_EXCEEDED',
  })
  @ApiUnprocessableEntityResponse({
    description: 'IDENTITY_PROFILE_INCOMPLETE o IDENTITY_VERIFICATION_UNAVAILABLE',
  })
  @ApiServiceUnavailableResponse({ description: 'El proveedor no respondió (SERVICE_UNAVAILABLE)' })
  async begin(
    @CurrentPrincipal() principal: Principal,
    @Body() body: StartIdentityVerificationRequest,
  ): Promise<IdentityVerificationResponse> {
    return IdentityVerificationResponse.from(
      await this.start.execute(principal, body),
      this.settings.consentVersion,
    );
  }
}
