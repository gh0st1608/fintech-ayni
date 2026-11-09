import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { CLOCK, type ClockPort } from '../../application/ports/clock.port';
import {
  STAFF_AUTHENTICATOR,
  type StaffAuthenticatorPort,
  type StaffRole,
} from '../../application/ports/staff-authenticator.port';
import { ForbiddenError, UnauthorizedError } from '../../errors/app-error';
import { type AppRequest } from '../http/app-request';

const BEARER = /^Bearer ([^\s]+)$/i;
const STAFF_ACCESS = Symbol('STAFF_ACCESS');

export const STAFF_ACCESS_SETTINGS = Symbol('STAFF_ACCESS_SETTINGS');

export interface StaffAccessSettings {
  /** Antigüedad máxima de la autenticación para una acción crítica (step-up), en segundos. */
  readonly stepUpMaxAgeSeconds: number;
}

interface StaffAccess {
  roles: readonly StaffRole[];
  stepUp: boolean;
}

/**
 * Exige alguno de los roles del personal (matriz de docs/backoffice-plan.md §5); con `stepUp`,
 * además una autenticación reciente. La ruta también debe ser `@Public()`: no usa el token de la
 * app.
 */
export const RequireStaff = (
  roles: StaffRole | readonly StaffRole[],
  options: { stepUp?: boolean } = {},
): MethodDecorator & ClassDecorator =>
  SetMetadata(STAFF_ACCESS, {
    roles: typeof roles === 'string' ? [roles] : roles,
    stepUp: options.stepUp ?? false,
  } satisfies StaffAccess);

/** Autoriza al personal en la API de administración (docs/backoffice-plan.md). */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(STAFF_AUTHENTICATOR) private readonly authenticator: StaffAuthenticatorPort,
    @Inject(STAFF_ACCESS_SETTINGS) private readonly settings: StaffAccessSettings,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const access = this.reflector.getAllAndOverride<StaffAccess | undefined>(STAFF_ACCESS, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Una ruta con el guard y sin rol declarado es un error de programación: se niega.
    if (!access) throw new ForbiddenError();

    const request = context.switchToHttp().getRequest<AppRequest>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedError();
    const staff = await this.authenticator.authenticate(token);
    if (access.stepUp) {
      const age = (this.clock.now().getTime() - staff.authenticatedAt.getTime()) / 1000;
      if (age > this.settings.stepUpMaxAgeSeconds) {
        throw new UnauthorizedError('Vuelve a autenticarte para esta acción');
      }
    }
    if (!staff.roles.some((role) => access.roles.includes(role))) throw new ForbiddenError();
    request.staff = staff;
    return true;
  }
}
