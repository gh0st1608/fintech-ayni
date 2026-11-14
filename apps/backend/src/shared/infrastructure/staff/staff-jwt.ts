import { type KeyObject, verify } from 'node:crypto';

import { UnauthorizedError } from '../../errors/app-error';
import {
  STAFF_ROLES,
  type StaffPrincipal,
  type StaffRole,
} from '../../application/ports/staff-authenticator.port';

/** Tolerancia de reloj con el proveedor de identidad al validar `exp`, `nbf` e `iat`. */
const CLOCK_SKEW_SECONDS = 60;

/** Algoritmos admitidos y el tipo de clave que exige cada uno: evita la confusión de algoritmos. */
const KEY_TYPE_BY_ALG = { RS256: 'rsa', ES256: 'ec' } as const;
export type StaffJwtAlgorithm = keyof typeof KEY_TYPE_BY_ALG;

export interface StaffJwtExpectations {
  issuer: string;
  /** Se compara con `aud`; si el token no trae `aud` (access token de Cognito), con `client_id`. */
  audience: string;
  /** Claim con los roles, p. ej. `cognito:groups`. Los valores que no son roles se ignoran. */
  rolesClaim: string;
  /**
   * Mapa de nombres de grupo del proveedor a roles de staff (p. ej. Identity Center). Sin él, los
   * valores del claim se tratan directamente como roles (compatible con Cognito cuando los grupos
   * se llaman igual que los roles).
   */
  groupsMap?: Readonly<Record<string, readonly StaffRole[]>>;
}

type Claims = Record<string, unknown>;

const invalid = () => new UnauthorizedError('Token del personal inválido');

function decodeSegment(segment: string): Claims {
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid();
    return value as Claims;
  } catch {
    throw invalid();
  }
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function audienceMatches(claims: Claims, audience: string): boolean {
  const { aud } = claims;
  if (typeof aud === 'string') return aud === audience;
  if (Array.isArray(aud)) return aud.includes(audience);
  return claims.client_id === audience;
}

function rolesOf(
  claims: Claims,
  rolesClaim: string,
  groupsMap?: Readonly<Record<string, readonly StaffRole[]>>,
): StaffRole[] {
  const raw = claims[rolesClaim];
  if (!Array.isArray(raw)) return [];
  if (groupsMap) {
    const roles = new Set<StaffRole>();
    for (const group of raw) {
      if (typeof group !== 'string') continue;
      for (const role of groupsMap[group] ?? []) roles.add(role);
    }
    return [...roles];
  }
  return STAFF_ROLES.filter((role) => raw.includes(role));
}

/**
 * Verifica un JWT del personal firmado con RS256 o ES256 usando `node:crypto`, y lo traduce a un
 * `StaffPrincipal`. `authenticatedAt` sale de `auth_time` (cuándo se autenticó de verdad, no cuándo
 * se renovó el token), que es lo que necesita el step-up; sin él, de `iat`.
 */
export async function verifyStaffJwt(
  token: string,
  keyFor: (kid: string | undefined, alg: StaffJwtAlgorithm) => Promise<KeyObject | null>,
  expected: StaffJwtExpectations,
  now: Date,
): Promise<StaffPrincipal> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) throw invalid();
  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];
  const header = decodeSegment(headerSegment);
  const alg = header.alg;
  if (alg !== 'RS256' && alg !== 'ES256') throw invalid();
  const kid = typeof header.kid === 'string' ? header.kid : undefined;

  const key = await keyFor(kid, alg);
  if (!key || key.asymmetricKeyType !== KEY_TYPE_BY_ALG[alg]) throw invalid();
  const signed = verify(
    'sha256',
    Buffer.from(`${headerSegment}.${payloadSegment}`),
    alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' } : key,
    Buffer.from(signatureSegment, 'base64url'),
  );
  if (!signed) throw invalid();

  const claims = decodeSegment(payloadSegment);
  const nowSeconds = now.getTime() / 1000;
  if (claims.iss !== expected.issuer || !audienceMatches(claims, expected.audience)) {
    throw invalid();
  }
  if (!isNumber(claims.exp) || claims.exp <= nowSeconds - CLOCK_SKEW_SECONDS) throw invalid();
  if (isNumber(claims.nbf) && claims.nbf > nowSeconds + CLOCK_SKEW_SECONDS) throw invalid();
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) throw invalid();
  const authTime = isNumber(claims.auth_time) ? claims.auth_time : claims.iat;
  if (!isNumber(authTime) || authTime > nowSeconds + CLOCK_SKEW_SECONDS) throw invalid();

  return {
    staffId: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    roles: rolesOf(claims, expected.rolesClaim, expected.groupsMap),
    authenticatedAt: new Date(authTime * 1000),
  };
}
