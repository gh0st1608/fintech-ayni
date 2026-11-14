import type { StaffAuthPort, DevCredentials } from '@/domain/ports';
import { AppError } from '@/domain/shared/AppError';
import type { StaffMember } from '@/domain/staff/Staff';
import { staffMeSchema } from '@/infrastructure/api/schemas';
import type { HttpClientPort } from '@/infrastructure/http/FetchHttpClient';
import type { TokenStore } from '@/infrastructure/http/TokenStore';

export interface OidcEndpoints {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
}

const SESSION_VERIFIER_KEY = 'oidc_code_verifier';
const SESSION_STATE_KEY = 'oidc_state';
const SESSION_RETURN_TO_KEY = 'oidc_return_to';

function base64url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return base64url(digest);
}

function generateVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes.buffer);
}

/**
 * Adaptador OIDC PKCE para IAM Identity Center. Implementa `StaffAuthPort` en modo OIDC:
 * - `initiateFlow()` redirige al proveedor (no retorna).
 * - `handleCallback()` intercambia el código por un access_token y lo guarda en memoria.
 * - `current()` y `signOut()` funcionan igual que `DevStaffAuth`.
 *
 * Los endpoints se descubren del issuer la primera vez que se necesitan (lazy).
 */
export class OidcStaffAuth implements StaffAuthPort {
  private endpointsPromise: Promise<OidcEndpoints> | null = null;

  constructor(
    private readonly issuer: string,
    private readonly clientId: string,
    private readonly redirectUri: string,
    private readonly http: HttpClientPort,
    private readonly tokens: TokenStore,
  ) {}

  private getEndpoints(): Promise<OidcEndpoints> {
    this.endpointsPromise ??= discoverOidcEndpoints(this.issuer);
    return this.endpointsPromise;
  }

  /** No aplica en modo OIDC: lanza si alguien la llama por error. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  signIn(_credentials: DevCredentials): Promise<StaffMember> {
    throw new AppError('validation', 'Usa initiateFlow() en modo OIDC');
  }

  initiateFlow(returnTo?: string): void {
    const verifier = generateVerifier();
    const state = crypto.randomUUID();

    try {
      sessionStorage.setItem(SESSION_VERIFIER_KEY, verifier);
      sessionStorage.setItem(SESSION_STATE_KEY, state);
      if (returnTo) sessionStorage.setItem(SESSION_RETURN_TO_KEY, returnTo);
      else sessionStorage.removeItem(SESSION_RETURN_TO_KEY);
    } catch {
      // sessionStorage blocked (private window): continue; callback will fail gracefully
    }

    Promise.all([generateChallenge(verifier), this.getEndpoints()])
      .then(([challenge, endpoints]) => {
        const url = new URL(endpoints.authorization_endpoint);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('client_id', this.clientId);
        url.searchParams.set('redirect_uri', this.redirectUri);
        url.searchParams.set('scope', 'openid email profile');
        url.searchParams.set('code_challenge', challenge);
        url.searchParams.set('code_challenge_method', 'S256');
        url.searchParams.set('state', state);
        window.location.href = url.toString();
      })
      .catch((err: unknown) => {
        console.error('[OidcStaffAuth] Error al iniciar flujo OIDC:', err);
      });
  }

  async handleCallback(code: string, state: string): Promise<StaffMember> {
    let savedState: string | null = null;
    let verifier: string | null = null;
    try {
      savedState = sessionStorage.getItem(SESSION_STATE_KEY);
      verifier = sessionStorage.getItem(SESSION_VERIFIER_KEY);
      sessionStorage.removeItem(SESSION_STATE_KEY);
      sessionStorage.removeItem(SESSION_VERIFIER_KEY);
    } catch {
      /* sessionStorage blocked */
    }

    if (!verifier || state !== savedState) {
      throw new AppError('unauthorized', 'Estado del flujo OIDC inválido o expirado');
    }

    const endpoints = await this.getEndpoints();

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      code,
      code_verifier: verifier,
    });

    const response = await fetch(endpoints.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new AppError('unauthorized', 'No se pudo intercambiar el código de autorización');
    }

    const data = (await response.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new AppError('unauthorized', 'El proveedor no devolvió un access_token');
    }
    this.tokens.set(data.access_token);

    const staff = await this.current();
    if (!staff) throw new AppError('unauthorized', 'No pudimos obtener el perfil del personal');
    return staff;
  }

  async current(signal?: AbortSignal): Promise<StaffMember | null> {
    if (!this.tokens.get()) return null;
    try {
      return await this.http.get('/admin/v1/me', { schema: staffMeSchema, signal });
    } catch (error) {
      if (error instanceof AppError && error.kind === 'unauthorized') {
        this.tokens.clear();
        return null;
      }
      throw error;
    }
  }

  signOut(): void {
    this.tokens.clear();
    this.getEndpoints()
      .then((endpoints) => {
        if (endpoints.end_session_endpoint) {
          const url = new URL(endpoints.end_session_endpoint);
          url.searchParams.set('client_id', this.clientId);
          window.location.href = url.toString();
        }
      })
      .catch(() => {
        /* si falla el descubrimiento al cerrar sesión, se ignoró el logout federado */
      });
  }
}

/** Obtiene los endpoints OIDC del documento de descubrimiento del proveedor. */
export async function discoverOidcEndpoints(issuer: string): Promise<OidcEndpoints> {
  const wellKnown = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const response = await fetch(wellKnown);
  if (!response.ok) throw new Error(`No se pudo obtener la configuración OIDC de ${issuer}`);
  const config = (await response.json()) as OidcEndpoints;
  if (!config.authorization_endpoint || !config.token_endpoint) {
    throw new Error('Documento OIDC incompleto: faltan authorization_endpoint o token_endpoint');
  }
  return config;
}
