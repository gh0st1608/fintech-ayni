import type { SocialAuthApiPort } from '@/domain/auth/ports/SocialAuthPorts';
import type { SocialCredential, SocialProvider } from '@/domain/auth/SocialLogin';
import { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';

/** Login social en memoria: modo fake de desarrollo y pruebas (COPAYNI-91). */
export class InMemorySocialAuthApi implements SocialAuthApiPort {
  readonly logins: SocialCredential[] = [];
  readonly exchanges: string[] = [];
  readonly linked = new Set<SocialProvider>();
  /** Con un valor, la próxima llamada falla con ese error. */
  failWith: Error | null = null;

  login(credential: SocialCredential): Promise<AuthTokens> {
    this.logins.push(credential);
    return this.tokens();
  }

  exchange(code: string): Promise<AuthTokens> {
    this.exchanges.push(code);
    return this.tokens();
  }

  async link(credential: SocialCredential): Promise<void> {
    await this.tokens();
    this.linked.add(credential.provider);
  }

  unlink(provider: SocialProvider): Promise<void> {
    this.linked.delete(provider);
    return Promise.resolve();
  }

  list(): Promise<SocialProvider[]> {
    return Promise.resolve([...this.linked]);
  }

  private tokens(): Promise<AuthTokens> {
    if (this.failWith) {
      const error = this.failWith;
      this.failWith = null;
      return Promise.reject(error);
    }
    return Promise.resolve(
      AuthTokens.create({ accessToken: 'access-social', refreshToken: 'refresh-social' }),
    );
  }
}
