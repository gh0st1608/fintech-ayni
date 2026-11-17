import { type ExecutionContext } from '@nestjs/common';

import {
  isAdminRequest,
  rateLimitFor,
  rateLimitOptions,
  throttlerKey,
} from '@src/shared/presentation/http/admin-rate-limit';

const LIMITS = { ttl: 60000, max: 100, adminTtl: 60000, adminMax: 10 };

/** Contexto HTTP mínimo: el throttler solo mira la ruta, la clase y el handler. */
function httpContext(path: string, className = 'AdminUsersController', handler = 'search') {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ path, url: `${path}?q=1` }) }),
    getClass: () => ({ name: className }),
    getHandler: () => ({ name: handler }),
  } as unknown as ExecutionContext;
}

describe('rate limit de /admin (COPAYNI-74)', () => {
  it('reconoce las rutas de administración y solo esas', () => {
    expect(isAdminRequest(httpContext('/admin/v1/users'))).toBe(true);
    expect(isAdminRequest(httpContext('/admin/v1/kyc/reviews/1/approve'))).toBe(true);
    expect(isAdminRequest(httpContext('/v1/circles'))).toBe(false);
    // Una ruta pública que empiece igual no cuenta: el prefijo incluye la barra.
    expect(isAdminRequest(httpContext('/administradores'))).toBe(false);
  });

  it('fuera de HTTP no hay ruta que mirar', () => {
    const context = { getType: () => 'rpc' } as unknown as ExecutionContext;
    expect(isAdminRequest(context)).toBe(false);
  });

  it('aplica a /admin un tope más estricto que al público', () => {
    expect(rateLimitFor(LIMITS, httpContext('/admin/v1/users'))).toEqual({
      ttl: 60000,
      limit: 10,
    });
    expect(rateLimitFor(LIMITS, httpContext('/v1/circles'))).toEqual({ ttl: 60000, limit: 100 });
  });

  it('el throttler de la aplicación resuelve ese tope en cada petición', () => {
    const options = rateLimitOptions(LIMITS);
    const throttlers = Array.isArray(options) ? options : options.throttlers;
    const admin = httpContext('/admin/v1/users');

    expect(throttlers).toHaveLength(1);
    for (const throttler of throttlers) {
      const limit = throttler.limit;
      const ttl = throttler.ttl;
      expect(typeof limit === 'function' ? limit(admin) : limit).toBe(10);
      expect(typeof ttl === 'function' ? ttl(admin) : ttl).toBe(60000);
    }
    // La clave agregada se registra en las opciones, no solo en la función suelta.
    expect(options).toMatchObject({ generateKey: throttlerKey });
  });

  it('en /admin el contador es uno solo por IP, no uno por endpoint', () => {
    const usuarios = throttlerKey(
      httpContext('/admin/v1/users', 'AdminUsersController', 'search'),
      '203.0.113.7',
      'default',
    );
    const kyc = throttlerKey(
      httpContext('/admin/v1/kyc/reviews', 'AdminKycController', 'list'),
      '203.0.113.7',
      'default',
    );

    // Misma clave: recorrer varios controladores no multiplica el presupuesto de esa IP.
    expect(usuarios).toBe(kyc);
    expect(usuarios).toContain('203.0.113.7');
  });

  it('otra IP tiene su propio contador', () => {
    const context = httpContext('/admin/v1/users');
    expect(throttlerKey(context, '203.0.113.7', 'default')).not.toBe(
      throttlerKey(context, '198.51.100.3', 'default'),
    );
  });

  it('fuera de /admin cada endpoint conserva su contador', () => {
    const circulos = throttlerKey(
      httpContext('/v1/circles', 'CirclesController', 'list'),
      '203.0.113.7',
      'default',
    );
    const pagos = throttlerKey(
      httpContext('/v1/payments', 'PaymentsController', 'list'),
      '203.0.113.7',
      'default',
    );

    expect(circulos).not.toBe(pagos);
  });
});
