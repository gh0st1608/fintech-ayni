import { Logger } from '@nestjs/common';

import { type ClockPort } from '../../../../shared/application/ports/clock.port';
import { InfrastructureError, NotFoundError } from '../../../../shared/errors/app-error';
import { type JwksPort } from '../../../../shared/infrastructure/crypto/http-jwks';
import {
  type IdentityProvider,
  type VerifiedIdentity,
} from '../../domain/entities/external-identity';
import {
  type IdentityProviderPort,
  type IdentityProvidersPort,
} from '../../application/ports/social-auth.ports';
import { claimString, isVerifiedEmail, verifyIdToken } from './id-token';

/**
 * Ese proveedor no está configurado en este ambiente (faltan los client id). Responde 503, como el
 * resto de lo que depende de un tercero: no es culpa de quien lo intenta ni se arregla reintentando
 * con otros datos.
 */
export class ProviderNotConfiguredError extends InfrastructureError {
  constructor(provider: IdentityProvider) {
    super(`El inicio de sesión con ${provider} no está disponible`);
  }
}

export interface GoogleSettings {
  /** Client id de Android, iOS y Web; lista cerrada de audiencias admitidas. */
  audiences: readonly string[];
}

/** Emisores de Google: publica el mismo token con y sin esquema. */
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;

/**
 * Google Identity (COPAYNI-91 §7). Verifica el ID Token contra el JWKS de Google y toma `sub`
 * como identificador; el correo es un atributo y solo se usa si Google lo declara verificado.
 */
export class GoogleIdentityAdapter implements IdentityProviderPort {
  readonly provider: IdentityProvider = 'google';

  constructor(
    private readonly settings: GoogleSettings,
    private readonly jwks: JwksPort,
    private readonly clock: ClockPort,
  ) {}

  isConfigured(): boolean {
    return this.settings.audiences.length > 0;
  }

  async verify(input: { idToken: string; nonce: string }): Promise<VerifiedIdentity> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError('google');
    const claims = await verifyIdToken(
      input.idToken,
      this.jwks,
      { issuers: GOOGLE_ISSUERS, audiences: this.settings.audiences },
      input.nonce,
      this.clock.now(),
    );
    const email = claimString(claims, 'email');
    return {
      provider: 'google',
      subject: claims.sub as string,
      // Un correo sin verificar no abre cuenta: cualquiera podría haberlo escrito.
      email: email && isVerifiedEmail(claims) ? email.toLowerCase() : null,
      privateEmail: false,
      firstName: claimString(claims, 'given_name'),
      lastName: claimString(claims, 'family_name'),
    };
  }
}

export interface AppleSettings {
  /** Bundle id de iOS y Services id del flujo web; lista cerrada de audiencias. */
  audiences: readonly string[];
}

const APPLE_ISSUER = 'https://appleid.apple.com';

/**
 * Sign in with Apple (COPAYNI-91 §7). Apple entrega el correo y el nombre **solo la primera vez**,
 * así que la cuenta se resuelve siempre por `sub`. Con "Ocultar mi correo" el email es un alias de
 * reenvío de Apple: sirve para escribirle a la persona, y queda marcado como privado.
 */
export class AppleIdentityAdapter implements IdentityProviderPort {
  readonly provider: IdentityProvider = 'apple';

  constructor(
    private readonly settings: AppleSettings,
    private readonly jwks: JwksPort,
    private readonly clock: ClockPort,
  ) {}

  isConfigured(): boolean {
    return this.settings.audiences.length > 0;
  }

  async verify(input: { idToken: string; nonce: string }): Promise<VerifiedIdentity> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError('apple');
    const claims = await verifyIdToken(
      input.idToken,
      this.jwks,
      { issuers: [APPLE_ISSUER], audiences: this.settings.audiences },
      input.nonce,
      this.clock.now(),
    );
    const email = claimString(claims, 'email');
    return {
      provider: 'apple',
      subject: claims.sub as string,
      email: email && isVerifiedEmail(claims) ? email.toLowerCase() : null,
      privateEmail: claims.is_private_email === true || claims.is_private_email === 'true',
      // Apple no manda el nombre en el token: llega aparte y solo en el primer inicio.
      firstName: null,
      lastName: null,
    };
  }
}

/** Catálogo de proveedores; un proveedor desconocido no llega hasta aquí (lo filtra el DTO). */
export class IdentityProviders implements IdentityProvidersPort {
  private readonly logger = new Logger('Auth');

  constructor(private readonly adapters: readonly IdentityProviderPort[]) {}

  configured(): readonly IdentityProvider[] {
    return this.adapters.filter((a) => a.isConfigured()).map((a) => a.provider);
  }

  of(provider: IdentityProvider): IdentityProviderPort {
    const adapter = this.adapters.find((candidate) => candidate.provider === provider);
    if (!adapter) throw new NotFoundError(`Proveedor ${provider} no disponible`);
    if (!adapter.isConfigured()) {
      this.logger.warn({ event: 'auth.social_provider_unconfigured', provider });
      throw new ProviderNotConfiguredError(provider);
    }
    return adapter;
  }
}
