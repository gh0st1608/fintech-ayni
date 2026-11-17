import type { SocialAuthApiPort, SocialSignInPort } from '@/domain/auth/ports/SocialAuthPorts';
import type { TokenStoragePort } from '@/domain/auth/ports/TokenStoragePort';
import type { SessionStatus } from '@/domain/auth/SessionStatus';
import type { SocialProvider } from '@/domain/auth/SocialLogin';

/** Cómo terminó: `cancelled` y `unsupported` no son errores y no se le muestran como fallo. */
export type SocialLoginOutcome =
  | { status: 'authenticated'; session: SessionStatus }
  | { status: 'cancelled' }
  | { status: 'unsupported' };

/**
 * Entrar con Google o Apple (COPAYNI-91). El SDK del proveedor entrega la credencial, el backend
 * la verifica y devuelve la sesión de Ayni, que se guarda como la del OTP.
 *
 * La credencial del proveedor no se guarda: se usa una vez y se descarta.
 */
export class SignInWithProviderUseCase {
  constructor(
    private readonly signIn: SocialSignInPort,
    private readonly api: SocialAuthApiPort,
    private readonly tokens: TokenStoragePort,
  ) {}

  async execute(provider: SocialProvider): Promise<SocialLoginOutcome> {
    const result = await this.signIn.signIn(provider);
    if (result.status === 'cancelled' || result.status === 'unsupported') return result;

    const tokens =
      result.status === 'session'
        ? // Apple en Android: el backend ya resolvió la cuenta y entregó un código de un solo uso.
          await this.api.exchange(result.exchangeCode)
        : await this.api.login(result.credential);
    // Entrar con un proveedor implica querer seguir dentro: la sesión se guarda.
    await this.tokens.save(tokens, { persist: true });
    return { status: 'authenticated', session: 'authenticated' };
  }
}

/** Qué proveedores puede ofrecer este dispositivo (Apple nativo solo existe en iOS). */
export class ListAvailableProvidersUseCase {
  constructor(private readonly signIn: SocialSignInPort) {}

  async execute(providers: readonly SocialProvider[]): Promise<SocialProvider[]> {
    const available = await Promise.all(
      providers.map(async (provider) =>
        (await this.signIn.isAvailable(provider)) ? provider : null,
      ),
    );
    return available.filter((provider) => provider !== null);
  }
}

/** Vincular un proveedor desde el perfil, con la sesión ya iniciada. */
export class LinkSocialProviderUseCase {
  constructor(
    private readonly signIn: SocialSignInPort,
    private readonly api: SocialAuthApiPort,
  ) {}

  async execute(provider: SocialProvider): Promise<'linked' | 'cancelled' | 'unsupported'> {
    const result = await this.signIn.signIn(provider);
    if (result.status === 'cancelled' || result.status === 'unsupported') return result.status;
    // El flujo web abre sesión por su cuenta: vincular exige la credencial directa.
    if (result.status === 'session') return 'unsupported';
    await this.api.link(result.credential);
    return 'linked';
  }
}

export class UnlinkSocialProviderUseCase {
  constructor(private readonly api: SocialAuthApiPort) {}

  execute(provider: SocialProvider): Promise<void> {
    return this.api.unlink(provider);
  }
}

export class ListSocialProvidersUseCase {
  constructor(private readonly api: SocialAuthApiPort) {}

  execute(signal?: AbortSignal): Promise<SocialProvider[]> {
    return this.api.list(signal);
  }
}
