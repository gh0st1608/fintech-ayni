import { createPrivateKey, createPublicKey, type KeyObject, sign, verify } from 'node:crypto';

import { type ClockPort } from '../../../../shared/application/ports/clock.port';
import {
  type AccessTokenVerifierPort,
  type Principal,
} from '../../../../shared/application/ports/access-token-verifier.port';
import { UnauthorizedError } from '../../../../shared/errors/app-error';
import { isUuid } from '../../../../shared/infrastructure/persistence/postgres-errors';
import { type AccessTokenIssuerPort } from '../../application/ports/auth.ports';

export interface JwtSettings {
  privateKey: KeyObject;
  keyId: string;
  issuer: string;
  audience: string;
  ttlSeconds: number;
}

interface JwtHeader {
  alg?: unknown;
  typ?: unknown;
  kid?: unknown;
}

interface JwtClaims {
  sub?: unknown;
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  iat?: unknown;
}

/** Tolerancia de reloj entre instancias al validar `exp` e `iat`. */
const CLOCK_SKEW_SECONDS = 30;

const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');

function decode<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
}

/** Clave de la configuración (PEM, con `\n` escapados si llega en una sola línea). */
export function parsePrivateKey(pem: string): KeyObject {
  const key = createPrivateKey(pem.replace(/\\n/g, '\n'));
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new Error('JWT_PRIVATE_KEY debe ser una clave EC P-256');
  }
  return key;
}

/**
 * Access tokens JWT firmados con ES256 (ECDSA P-256 + SHA-256) usando `node:crypto`, sin
 * dependencias. La firma usa el formato JOSE (r || s, 64 bytes), no DER.
 */
export class Es256JwtIssuer implements AccessTokenIssuerPort {
  constructor(
    private readonly settings: JwtSettings,
    private readonly clock: ClockPort,
  ) {}

  issue(userId: string): string {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const { keyId, issuer, audience, ttlSeconds, privateKey } = this.settings;
    const input = `${encode({ alg: 'ES256', typ: 'JWT', kid: keyId })}.${encode({
      sub: userId,
      iss: issuer,
      aud: audience,
      iat,
      exp: iat + ttlSeconds,
    })}`;
    const signature = sign('sha256', Buffer.from(input), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    });
    return `${input}.${signature.toString('base64url')}`;
  }
}

/**
 * Valida firma, algoritmo (solo ES256: nunca `none` ni HS256 con la clave pública), `kid`,
 * emisor, audiencia y vigencia. Cualquier fallo responde UNAUTHORIZED sin decir por qué.
 */
export class Es256JwtVerifier implements AccessTokenVerifierPort {
  private readonly publicKey: KeyObject;

  constructor(
    private readonly settings: JwtSettings,
    private readonly clock: ClockPort,
  ) {
    this.publicKey = createPublicKey(settings.privateKey);
  }

  verify(accessToken: string): Promise<Principal> {
    try {
      return Promise.resolve({ userId: this.claimsOf(accessToken) });
    } catch {
      return Promise.reject(new UnauthorizedError());
    }
  }

  private claimsOf(token: string): string {
    const segments = token.split('.');
    if (segments.length !== 3) throw new Error('formato');
    const [headerSegment = '', payloadSegment = '', signatureSegment = ''] = segments;

    const header = decode<JwtHeader>(headerSegment);
    if (header.alg !== 'ES256' || header.kid !== this.settings.keyId) throw new Error('cabecera');
    const signatureOk = verify(
      'sha256',
      Buffer.from(`${headerSegment}.${payloadSegment}`),
      { key: this.publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signatureSegment, 'base64url'),
    );
    if (!signatureOk) throw new Error('firma');

    const claims = decode<JwtClaims>(payloadSegment);
    const now = this.clock.now().getTime() / 1000;
    if (
      claims.iss !== this.settings.issuer ||
      claims.aud !== this.settings.audience ||
      typeof claims.exp !== 'number' ||
      typeof claims.iat !== 'number' ||
      claims.exp + CLOCK_SKEW_SECONDS <= now ||
      claims.iat - CLOCK_SKEW_SECONDS > now ||
      typeof claims.sub !== 'string' ||
      !isUuid(claims.sub)
    ) {
      throw new Error('claims');
    }
    return claims.sub;
  }
}
