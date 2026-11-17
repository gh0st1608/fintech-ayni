import { z } from 'zod';

import type { SocialAuthApiPort } from '@/domain/auth/ports/SocialAuthPorts';
import type { SocialCredential, SocialProvider } from '@/domain/auth/SocialLogin';
import { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';

const tokensDto = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

const identitiesDto = z.object({
  identities: z.array(z.object({ provider: z.enum(['google', 'apple']) })),
});

/** Login social contra el backend (docs/api/social-auth.md, COPAYNI-91). */
export class SocialAuthApiRepository implements SocialAuthApiPort {
  constructor(private readonly http: HttpClientPort) {}

  async login(credential: SocialCredential, signal?: AbortSignal): Promise<AuthTokens> {
    const dto = await this.http.post(`/auth/social/${credential.provider}`, {
      body: { idToken: credential.idToken, nonce: credential.nonce },
      signal,
      // Es el inicio de sesión: un 401 aquí no debe disparar la renovación de una sesión que no hay.
      skipSessionRefresh: true,
      parse: (data) => tokensDto.parse(data),
    });
    return AuthTokens.create(dto);
  }

  async exchange(code: string, signal?: AbortSignal): Promise<AuthTokens> {
    const dto = await this.http.post('/auth/social/apple/exchange', {
      body: { code },
      signal,
      skipSessionRefresh: true,
      parse: (data) => tokensDto.parse(data),
    });
    return AuthTokens.create(dto);
  }

  async link(credential: SocialCredential): Promise<void> {
    await this.http.post(`/me/social-identities/${credential.provider}`, {
      body: { idToken: credential.idToken, nonce: credential.nonce },
      parse: () => undefined,
    });
  }

  async unlink(provider: SocialProvider): Promise<void> {
    await this.http.delete(`/me/social-identities/${provider}`, { parse: () => undefined });
  }

  async list(signal?: AbortSignal): Promise<SocialProvider[]> {
    const dto = await this.http.get('/me/social-identities', {
      signal,
      parse: (data) => identitiesDto.parse(data),
    });
    return dto.identities.map((identity) => identity.provider);
  }
}
