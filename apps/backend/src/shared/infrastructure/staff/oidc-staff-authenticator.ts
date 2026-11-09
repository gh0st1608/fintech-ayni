import { createPublicKey, type JsonWebKey, type KeyObject } from 'node:crypto';

import { Logger } from '@nestjs/common';

import { type ClockPort } from '../../application/ports/clock.port';
import {
  type StaffAuthenticatorPort,
  type StaffPrincipal,
} from '../../application/ports/staff-authenticator.port';
import { UnauthorizedError } from '../../errors/app-error';
import { type StaffJwtExpectations, verifyStaffJwt } from './staff-jwt';

/** Claves públicas del proveedor de identidad, por `kid`. */
export interface JwksPort {
  key(kid: string): Promise<KeyObject | null>;
}

export interface HttpJwksSettings {
  url: string;
  /** Cuánto se reutilizan las claves antes de volver a pedirlas. */
  cacheSeconds: number;
  /** Mínimo entre dos descargas por un `kid` desconocido: un token falso no fuerza descargas. */
  minRefreshSeconds: number;
}

type Fetch = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

const JWKS_TIMEOUT_MS = 5_000;

/**
 * JWKS del proveedor por HTTPS, con caché. Ante un `kid` desconocido (rotación de claves) vuelve a
 * descargar, como mucho cada `minRefreshSeconds`. Si la descarga falla conserva las claves que
 * tenía.
 */
export class HttpJwks implements JwksPort {
  private readonly logger = new Logger('StaffAuth');
  private keys = new Map<string, KeyObject>();
  /** Última descarga exitosa y último intento, en ms. */
  private fetchedAt = Number.NEGATIVE_INFINITY;
  private attemptedAt = Number.NEGATIVE_INFINITY;
  private pending: Promise<void> | null = null;

  constructor(
    private readonly settings: HttpJwksSettings,
    private readonly clock: ClockPort,
    private readonly fetchFn: Fetch = fetch,
  ) {}

  async key(kid: string): Promise<KeyObject | null> {
    const now = this.clock.now().getTime();
    const stale = now - this.fetchedAt >= this.settings.cacheSeconds * 1000;
    const canRetry = now - this.attemptedAt >= this.settings.minRefreshSeconds * 1000;
    if (canRetry && (stale || !this.keys.has(kid))) await this.refresh();
    return this.keys.get(kid) ?? null;
  }

  private refresh(): Promise<void> {
    this.pending ??= this.download().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async download(): Promise<void> {
    this.attemptedAt = this.clock.now().getTime();
    try {
      const response = await this.fetchFn(this.settings.url, {
        signal: AbortSignal.timeout(JWKS_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { keys?: unknown };
      if (!Array.isArray(body.keys)) throw new Error('Respuesta sin keys');
      const keys = new Map<string, KeyObject>();
      for (const jwk of body.keys as (JsonWebKey & { kid?: unknown; use?: unknown })[]) {
        if (typeof jwk.kid !== 'string' || (jwk.use !== undefined && jwk.use !== 'sig')) continue;
        keys.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
      }
      this.keys = keys;
      this.fetchedAt = this.attemptedAt;
    } catch (error) {
      // Conserva las claves que tenía; el próximo intento será tras `minRefreshSeconds`.
      this.logger.warn({
        event: 'staff.jwks.fetch_failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Personal autenticado por un proveedor OIDC con MFA (recomendado: Amazon Cognito, BO2 de
 * docs/backoffice-plan.md). Valida firma, emisor, audiencia y vigencia; los roles salen de los
 * grupos del proveedor.
 */
export class OidcStaffAuthenticator implements StaffAuthenticatorPort {
  constructor(
    private readonly expected: StaffJwtExpectations,
    private readonly jwks: JwksPort,
    private readonly clock: ClockPort,
  ) {}

  authenticate(accessToken: string): Promise<StaffPrincipal> {
    return verifyStaffJwt(
      accessToken,
      async (kid) => {
        if (!kid) throw new UnauthorizedError('Token del personal inválido');
        return this.jwks.key(kid);
      },
      this.expected,
      this.clock.now(),
    );
  }
}
