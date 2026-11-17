import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { type Response } from 'express';

import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type Principal } from '../../../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../../../shared/presentation/decorators/current-principal.decorator';
import { Public } from '../../../../../shared/presentation/decorators/public.decorator';
import {
  SOCIAL_AUTH_SETTINGS,
  type SocialAuthSettings,
} from '../../../application/ports/social-auth.ports';
import {
  CompleteAppleWebFlowUseCase,
  ExchangeSocialCodeUseCase,
  StartAppleWebFlowUseCase,
} from '../../../application/use-cases/apple-web-flow.use-cases';
import {
  LinkSocialIdentityUseCase,
  ListSocialIdentitiesUseCase,
  SocialLoginUseCase,
  UnlinkSocialIdentityUseCase,
} from '../../../application/use-cases/social-login.use-cases';
import { AuthTokensResponse } from '../dto/auth.dto';
import {
  AppleAuthorizeResponse,
  AppleCallbackRequest,
  ExchangeSocialCodeRequest,
  ProviderParam,
  SocialIdentitiesResponse,
  SocialLoginRequest,
} from '../dto/social-auth.dto';

const ENVELOPE = 'Envuelto en { success, data, traceId }';
const TOKEN_REJECTED =
  'SOCIAL_TOKEN_INVALID: firma, emisor, audiencia, vigencia o nonce que no cuadran';

/**
 * Entrar con Google o Apple (COPAYNI-91). El proveedor autentica; Ayni verifica su credencial y
 * emite **su propia** sesión, la misma que el OTP: los tokens del proveedor nunca son la sesión.
 */
@ApiTags('auth')
@Public()
@Controller({ path: 'auth/social', version: '1' })
export class SocialAuthController {
  constructor(
    @Inject(SocialLoginUseCase) private readonly socialLogin: SocialLoginUseCase,
    @Inject(StartAppleWebFlowUseCase) private readonly startApple: StartAppleWebFlowUseCase,
    @Inject(CompleteAppleWebFlowUseCase)
    private readonly completeApple: CompleteAppleWebFlowUseCase,
    @Inject(ExchangeSocialCodeUseCase) private readonly exchangeCode: ExchangeSocialCodeUseCase,
    @Inject(SOCIAL_AUTH_SETTINGS) private readonly settings: SocialAuthSettings,
  ) {}

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthTokensResponse, description: `${ENVELOPE}. Sesión de Ayni` })
  @ApiUnauthorizedResponse({ description: TOKEN_REJECTED })
  @ApiBadRequestResponse({ description: 'Sin correo del proveedor para abrir la cuenta' })
  @ApiConflictResponse({ description: 'SOCIAL_EMAIL_TAKEN: ese correo ya es de otra cuenta' })
  @ApiServiceUnavailableResponse({ description: 'Google no configurado en este ambiente' })
  async google(@Body() body: SocialLoginRequest): Promise<AuthTokensResponse> {
    return AuthTokensResponse.from(await this.socialLogin.execute({ provider: 'google', ...body }));
  }

  @Post('apple')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthTokensResponse, description: `${ENVELOPE}. Flujo nativo de iOS` })
  @ApiUnauthorizedResponse({ description: TOKEN_REJECTED })
  @ApiConflictResponse({ description: 'SOCIAL_EMAIL_TAKEN: ese correo ya es de otra cuenta' })
  @ApiServiceUnavailableResponse({ description: 'Apple no configurado en este ambiente' })
  async apple(@Body() body: SocialLoginRequest): Promise<AuthTokensResponse> {
    return AuthTokensResponse.from(await this.socialLogin.execute({ provider: 'apple', ...body }));
  }

  @Post('apple/authorize')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AppleAuthorizeResponse, description: `${ENVELOPE}. Android` })
  @ApiServiceUnavailableResponse({ description: 'Apple no configurado en este ambiente' })
  async authorizeApple(): Promise<AppleAuthorizeResponse> {
    return this.startApple.execute();
  }

  /**
   * Vuelta de Apple. Responde una redirección al deep link de la app **con el código interno**,
   * nunca con tokens: un deep link queda en historiales y registros del sistema.
   */
  /**
   * Se responde con `@Res()` en vez de `@Redirect()` porque la redirección no lleva cuerpo: el
   * envoltorio `{ success, data }` no aplica aquí.
   */
  @Post('apple/callback')
  @ApiOkResponse({ description: 'Redirección al deep link de la app con el código interno' })
  async appleCallback(
    @Body() body: AppleCallbackRequest,
    @Res() response: Response,
  ): Promise<void> {
    const base = this.settings.apple.appRedirectUri;
    // La persona canceló en Apple: vuelve a la app sin código y sin sesión (QA-13).
    if (body.error) {
      response.redirect(HttpStatus.FOUND, `${base}?error=cancelled`);
      return;
    }
    const code = await this.completeApple.execute({
      state: body.state,
      code: body.code,
      idToken: body.id_token,
    });
    response.redirect(HttpStatus.FOUND, `${base}?code=${encodeURIComponent(code)}`);
  }

  @Post('apple/exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthTokensResponse, description: `${ENVELOPE}. Sesión de Ayni` })
  @ApiUnauthorizedResponse({ description: 'Código inexistente, ya usado o vencido' })
  async exchange(@Body() body: ExchangeSocialCodeRequest): Promise<AuthTokensResponse> {
    return AuthTokensResponse.from(await this.exchangeCode.execute(body.code));
  }
}

/**
 * Vincular y desvincular proveedores desde el perfil (COPAYNI-91 §11). Exige sesión: coincidir en
 * el correo nunca basta para vincular.
 */
@ApiTags('auth')
@ApiBearerAuth()
@Controller({ path: 'me/social-identities', version: '1' })
export class SocialIdentitiesController {
  constructor(
    @Inject(ListSocialIdentitiesUseCase) private readonly list: ListSocialIdentitiesUseCase,
    @Inject(LinkSocialIdentityUseCase) private readonly link: LinkSocialIdentityUseCase,
    @Inject(UnlinkSocialIdentityUseCase) private readonly unlink: UnlinkSocialIdentityUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: SocialIdentitiesResponse, description: ENVELOPE })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async all(@CurrentPrincipal() principal: Principal): Promise<SocialIdentitiesResponse> {
    return SocialIdentitiesResponse.from(await this.list.execute(principal.userId));
  }

  @Post(':provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Vinculado; repetirlo no cambia nada' })
  @ApiUnauthorizedResponse({ description: TOKEN_REJECTED })
  @ApiConflictResponse({ description: 'SOCIAL_IDENTITY_TAKEN: ya es de otra cuenta' })
  async linkProvider(
    @CurrentPrincipal() principal: Principal,
    @Param() params: ProviderParam,
    @Body() body: SocialLoginRequest,
  ): Promise<void> {
    await this.link.execute(principal.userId, { provider: params.provider, ...body });
  }

  @Delete(':provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Desvinculado; se sigue entrando con el código al celular' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async unlinkProvider(
    @CurrentPrincipal() principal: Principal,
    @Param() params: ProviderParam,
  ): Promise<void> {
    await this.unlink.execute(principal.userId, params.provider);
  }
}
