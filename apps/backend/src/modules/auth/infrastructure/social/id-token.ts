import { createHash, type KeyObject, verify as verifySignature } from 'node:crypto';

import { UnauthorizedError } from '../../../../shared/errors/app-error';
import { type JwksPort } from '../../../../shared/infrastructure/crypto/http-jwks';

/** Tolerancia de reloj con el proveedor al validar `exp`, `nbf` e `iat`. */
const CLOCK_SKEW_SECONDS = 60;

/** Algoritmos admitidos y el tipo de clave que exige cada uno: evita la confusión de algoritmos. */
const KEY_TYPE_BY_ALG = { RS256: 'rsa', ES256: 'ec' } as const;

export type IdTokenClaims = Record<string, unknown>;

export interface IdTokenExpectations {
  /** Emisores admitidos; Google publica el suyo con y sin esquema. */
  issuers: readonly string[];
  /**
   * Audiencias admitidas: los client id de cada plataforma. Es una lista cerrada, para que un
   * token emitido para otra aplicación no abra sesión en Ayni.
   */
  audiences: readonly string[];
}

/**
 * El token del proveedor no vale. A la persona se le responde siempre lo mismo (401) y el motivo
 * concreto queda solo en `reason`, para el log: decir qué falló ayudaría a quien lo intenta.
 */
export class SocialTokenError extends UnauthorizedError {
  constructor(readonly reason: string) {
    super('No pudimos verificar tu cuenta con el proveedor');
  }
}

const invalid = (reason: string): SocialTokenError => new SocialTokenError(reason);

function decodeSegment(segment: string, what: string): IdTokenClaims {
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw invalid(`${what} no es un objeto`);
    }
    return value as IdTokenClaims;
  } catch {
    throw invalid(`${what} ilegible`);
  }
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function audienceMatches(claims: IdTokenClaims, audiences: readonly string[]): boolean {
  const { aud } = claims;
  if (typeof aud === 'string') return audiences.includes(aud);
  return (
    Array.isArray(aud) &&
    aud.some((value) => typeof value === 'string' && audiences.includes(value))
  );
}

/**
 * El nonce ata el token a **este** intento de inicio de sesión. Se acepta el valor tal cual y
 * también su SHA-256 en hexadecimal, porque algunos SDK envían el hash al proveedor y conservan el
 * original en el dispositivo. En los dos casos hay que conocer el nonce original: un token
 * obtenido en otra sesión no pasa.
 */
export function nonceMatches(claim: unknown, nonce: string): boolean {
  if (typeof claim !== 'string' || claim.length === 0) return false;
  if (claim === nonce) return true;
  return claim === createHash('sha256').update(nonce).digest('hex');
}

/**
 * Verifica un ID token de un proveedor OIDC (Google o Apple) contra su JWKS: firma, emisor,
 * audiencia, vigencia, `sub` y nonce. Nunca se confía en el contenido sin comprobar la firma.
 */
export async function verifyIdToken(
  token: string,
  jwks: JwksPort,
  expected: IdTokenExpectations,
  nonce: string,
  now: Date,
): Promise<IdTokenClaims> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) throw invalid('formato');
  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];

  const header = decodeSegment(headerSegment, 'cabecera');
  const alg = header.alg;
  if (alg !== 'RS256' && alg !== 'ES256') throw invalid('algoritmo');
  const kid = typeof header.kid === 'string' ? header.kid : null;
  if (!kid) throw invalid('sin kid');

  const key: KeyObject | null = await jwks.key(kid);
  if (!key || key.asymmetricKeyType !== KEY_TYPE_BY_ALG[alg]) throw invalid('clave');
  const signed = verifySignature(
    'sha256',
    Buffer.from(`${headerSegment}.${payloadSegment}`),
    alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' } : key,
    Buffer.from(signatureSegment, 'base64url'),
  );
  if (!signed) throw invalid('firma');

  const claims = decodeSegment(payloadSegment, 'contenido');
  const nowSeconds = now.getTime() / 1000;
  if (typeof claims.iss !== 'string' || !expected.issuers.includes(claims.iss)) {
    throw invalid('emisor');
  }
  if (!audienceMatches(claims, expected.audiences)) throw invalid('audiencia');
  if (!isNumber(claims.exp) || claims.exp <= nowSeconds - CLOCK_SKEW_SECONDS) {
    throw invalid('vencido');
  }
  if (isNumber(claims.nbf) && claims.nbf > nowSeconds + CLOCK_SKEW_SECONDS) throw invalid('nbf');
  if (isNumber(claims.iat) && claims.iat > nowSeconds + CLOCK_SKEW_SECONDS) throw invalid('iat');
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) throw invalid('sin sub');
  if (!nonceMatches(claims.nonce, nonce)) throw invalid('nonce');
  return claims;
}

/** `email_verified` llega como booleano o como texto, según el proveedor. */
export const isVerifiedEmail = (claims: IdTokenClaims): boolean =>
  claims.email_verified === true || claims.email_verified === 'true';

export const claimString = (claims: IdTokenClaims, name: string): string | null => {
  const value = claims[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};
