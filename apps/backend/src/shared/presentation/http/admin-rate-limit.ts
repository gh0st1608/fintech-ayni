import { type ExecutionContext } from '@nestjs/common';
import { type ThrottlerModuleOptions } from '@nestjs/throttler';

import { type AppRequest } from './app-request';

/** Todas las rutas del back-office cuelgan de aquí (`admin/v1/...`, sin versionado por URI). */
const ADMIN_PREFIX = '/admin/';

export interface RateLimits {
  /** Ventana y tope de las rutas públicas (app móvil). */
  ttl: number;
  max: number;
  /** Ventana y tope de `/admin`, más estrictos: lo usa un puñado de personas, no miles. */
  adminTtl: number;
  adminMax: number;
}

/** Una petición de la API de administración. Fuera de HTTP (jobs, RPC) nunca lo es. */
export function isAdminRequest(context: ExecutionContext): boolean {
  if (context.getType() !== 'http') return false;
  const request = context.switchToHttp().getRequest<AppRequest>();
  const path = request.path ?? request.url?.split('?')[0] ?? '';
  return path.startsWith(ADMIN_PREFIX);
}

/**
 * Clave del contador. En `/admin` se agrega **por IP para toda la API de administración**, no por
 * endpoint: si cada ruta llevara su propio contador, una IP multiplicaría su presupuesto por el
 * número de controladores y el tope dejaría de significar nada. Fuera de `/admin` se conserva el
 * contador por endpoint de la librería, porque las rutas públicas tienen ritmos muy distintos
 * entre sí (pedir un OTP no se parece a listar círculos).
 */
export function throttlerKey(context: ExecutionContext, tracker: string, name: string): string {
  if (isAdminRequest(context)) return `admin-${name}-${tracker}`;
  return `${context.getClass().name}-${context.getHandler().name}-${name}-${tracker}`;
}

/**
 * Rate limit con un tope propio para `/admin` (COPAYNI-74).
 *
 * BO8 se decidió sin filtro de red: `/admin` queda en internet, detrás del login corporativo con
 * MFA. Este tope es la contención que queda del lado de la aplicación frente a un token robado o
 * a una lectura masiva de datos personales; el WAF pone la suya por delante, por IP.
 */
export function rateLimitOptions(limits: RateLimits): ThrottlerModuleOptions {
  return {
    throttlers: [
      {
        ttl: (context) => rateLimitFor(limits, context).ttl,
        limit: (context) => rateLimitFor(limits, context).limit,
      },
    ],
    generateKey: throttlerKey,
  };
}

/** Ventana y tope que le tocan a esta petición. */
export function rateLimitFor(
  limits: RateLimits,
  context: ExecutionContext,
): { ttl: number; limit: number } {
  return isAdminRequest(context)
    ? { ttl: limits.adminTtl, limit: limits.adminMax }
    : { ttl: limits.ttl, limit: limits.max };
}
