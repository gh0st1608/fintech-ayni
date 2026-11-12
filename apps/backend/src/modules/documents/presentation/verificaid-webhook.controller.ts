import { createHash, timingSafeEqual } from 'node:crypto';

import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { UnauthorizedError } from '../../../shared/errors/app-error';
import { Public } from '../../../shared/presentation/decorators/public.decorator';
import { HandleIdentityWebhookUseCase } from '../application/identity-verification.use-cases';

export const VERIFICAID_WEBHOOK_SETTINGS = Symbol('VERIFICAID_WEBHOOK_SETTINGS');

export interface VerificaIdWebhookSettings {
  /** Token secreto de la URL del webhook; sin él se rechaza todo. */
  token: string | null;
}

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/** Compara en tiempo constante (los hash igualan el largo). */
const sameToken = (expected: string, received: string): boolean =>
  timingSafeEqual(digest(expected), digest(received));

/**
 * Webhook de VerificaID (`kyc.created` y `kyc.updated`, COPAYNI-42). VerificaID no documenta una
 * firma: la URL lleva un token secreto (`?token=`) y, aun así, el contenido no se usa más que para
 * identificar la sesión; el resultado siempre se consulta a la API con credenciales.
 */
@ApiExcludeController()
@Public()
@Controller({ path: 'webhooks/verificaid', version: '1' })
export class VerificaIdWebhookController {
  constructor(
    @Inject(HandleIdentityWebhookUseCase) private readonly handle: HandleIdentityWebhookUseCase,
    @Inject(VERIFICAID_WEBHOOK_SETTINGS) private readonly settings: VerificaIdWebhookSettings,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Query('token') token: string | undefined,
    @Body() body: { event_type?: string; payload?: { id?: unknown } },
  ): Promise<{ received: true }> {
    if (this.settings.token === null || !token || !sameToken(this.settings.token, token)) {
      throw new UnauthorizedError('Token del webhook inválido');
    }
    const sessionId = body?.payload?.id;
    // Los demás eventos o un cuerpo sin sesión se confirman para que no se reintenten.
    if (
      (body?.event_type === 'kyc.created' || body?.event_type === 'kyc.updated') &&
      typeof sessionId === 'string' &&
      sessionId.length > 0 &&
      sessionId.length <= 64
    ) {
      await this.handle.execute(sessionId);
    }
    return { received: true };
  }
}
