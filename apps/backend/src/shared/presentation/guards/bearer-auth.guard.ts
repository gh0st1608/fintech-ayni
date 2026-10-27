import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  ACCESS_TOKEN_VERIFIER,
  type AccessTokenVerifierPort,
} from '../../application/ports/access-token-verifier.port';
import { UnauthorizedError } from '../../errors/app-error';
import { IS_PUBLIC } from '../decorators/public.decorator';
import { type AppRequest } from '../http/app-request';

const BEARER = /^Bearer ([^\s]+)$/i;

/**
 * Autenticación por defecto en todas las rutas: exige `Authorization: Bearer <token>` salvo
 * en las marcadas con `@Public()`. Solo autentica; las reglas de acceso viven en los casos de uso.
 */
@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_VERIFIER) private readonly verifier: AccessTokenVerifierPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AppRequest>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedError();

    request.principal = await this.verifier.verify(token);
    return true;
  }
}
