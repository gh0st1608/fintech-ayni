import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { Public } from '../../../../../shared/presentation/decorators/public.decorator';
import {
  ResendOtpUseCase,
  StartAuthenticationUseCase,
  VerifyOtpUseCase,
} from '../../../application/use-cases/otp.use-cases';
import {
  LogoutUseCase,
  RefreshSessionUseCase,
} from '../../../application/use-cases/session.use-cases';
import {
  AuthChallengeResponse,
  AuthTokensResponse,
  RefreshTokenRequest,
  ResendOtpRequest,
  StartAuthRequest,
  VerifyOtpRequest,
} from '../dto/auth.dto';

const ENVELOPE = 'Envuelto en { success, data, traceId }';

/** Autenticación sin contraseña (docs/api/auth.md). Todas las rutas son públicas. */
@ApiTags('auth')
@Public()
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    @Inject(StartAuthenticationUseCase) private readonly startAuth: StartAuthenticationUseCase,
    @Inject(VerifyOtpUseCase) private readonly verifyOtp: VerifyOtpUseCase,
    @Inject(ResendOtpUseCase) private readonly resendOtp: ResendOtpUseCase,
    @Inject(RefreshSessionUseCase) private readonly refreshSession: RefreshSessionUseCase,
    @Inject(LogoutUseCase) private readonly logoutSession: LogoutUseCase,
  ) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthChallengeResponse, description: ENVELOPE })
  @ApiBadRequestResponse({ description: 'Formato inválido (VALIDATION_ERROR)' })
  @ApiTooManyRequestsResponse({ description: 'RATE_LIMITED, con Retry-After en segundos' })
  @ApiServiceUnavailableResponse({ description: 'Sin proveedor de envío de OTP' })
  async start(@Body() body: StartAuthRequest): Promise<AuthChallengeResponse> {
    return AuthChallengeResponse.from(await this.startAuth.execute(body));
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthTokensResponse, description: ENVELOPE })
  @ApiUnprocessableEntityResponse({
    description: 'OTP_INVALID (details.attemptsRemaining), OTP_EXPIRED u OTP_ATTEMPTS_EXCEEDED',
  })
  async verify(@Body() body: VerifyOtpRequest): Promise<AuthTokensResponse> {
    return AuthTokensResponse.from(await this.verifyOtp.execute(body));
  }

  @Post('resend')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthChallengeResponse, description: ENVELOPE })
  @ApiTooManyRequestsResponse({ description: 'Antes de resendAvailableAt o sin reenvíos' })
  @ApiNotFoundResponse({ description: 'Desafío inexistente' })
  async resend(@Body() body: ResendOtpRequest): Promise<AuthChallengeResponse> {
    return AuthChallengeResponse.from(await this.resendOtp.execute(body));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthTokensResponse, description: ENVELOPE })
  @ApiUnauthorizedResponse({ description: 'Refresh token vencido, revocado o reutilizado' })
  async refresh(@Body() body: RefreshTokenRequest): Promise<AuthTokensResponse> {
    return AuthTokensResponse.from(await this.refreshSession.execute(body.refreshToken));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Siempre, aunque el token ya no exista' })
  async logout(@Body() body: RefreshTokenRequest): Promise<void> {
    await this.logoutSession.execute(body.refreshToken);
  }
}
