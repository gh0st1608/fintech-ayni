import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { type Principal } from '../../application/ports/access-token-verifier.port';
import { UnauthorizedError } from '../../errors/app-error';
import { type AppRequest } from '../http/app-request';

export function principalOf(request: AppRequest): Principal {
  if (!request.principal) throw new UnauthorizedError();
  return request.principal;
}

/** Usuario autenticado por `BearerAuthGuard`. */
export const CurrentPrincipal = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  principalOf(context.switchToHttp().getRequest<AppRequest>()),
);
