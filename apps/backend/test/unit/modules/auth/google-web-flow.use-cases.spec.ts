import { createHash } from 'node:crypto';

import {
  type GoogleWebFlowPort,
  type SocialAuthFlow,
  type SocialAuthFlowsPort,
  type SocialAuthSettings,
} from '@src/modules/auth/application/ports/social-auth.ports';
import {
  CompleteGoogleWebFlowUseCase,
  StartGoogleWebFlowUseCase,
} from '@src/modules/auth/application/use-cases/google-web-flow.use-cases';
import { type SocialLoginUseCase } from '@src/modules/auth/application/use-cases/social-login.use-cases';
import { InfrastructureError, UnauthorizedError } from '@src/shared/errors/app-error';
import { TestClock } from '@test/support/create-test-app';

/**
 * Intento web de Google (COPAYNI-91 §9). Lo que se comprueba aquí es que al navegador no viaje
 * nada que permita canjear el código, y que un intento ajeno, repetido o sin verifier no abra
 * sesión. El canje con Google tiene sus propias pruebas.
 */
const NOW = new Date('2026-11-18T12:00:00Z');

const settings = (): SocialAuthSettings => ({
  flowTtlSeconds: 600,
  appRedirectUri: 'ayni://auth/social',
  apple: {
    authorizationUrl: 'https://appleid.apple.com/auth/authorize',
    serviceId: '',
    redirectUri: '',
  },
  google: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientId: '123-abc.apps.googleusercontent.com',
    redirectUri: 'https://api.ayni.test/v1/auth/social/google/callback',
  },
});

class FakeFlows implements SocialAuthFlowsPort {
  created: Omit<SocialAuthFlow, 'userId' | 'exchangeCodeHash' | 'consumedAt'>[] = [];
  next: SocialAuthFlow | null = null;
  attached: { state: string; userId: string; codeHash: string }[] = [];

  create(flow: Omit<SocialAuthFlow, 'userId' | 'exchangeCodeHash' | 'consumedAt'>): Promise<void> {
    this.created.push(flow);
    return Promise.resolve();
  }

  consumeState(): Promise<SocialAuthFlow | null> {
    return Promise.resolve(this.next);
  }

  attachExchangeCode(state: string, userId: string, codeHash: string): Promise<void> {
    this.attached.push({ state, userId, codeHash });
    return Promise.resolve();
  }

  consumeExchangeCode(): Promise<SocialAuthFlow | null> {
    return Promise.resolve(null);
  }
}

const flowOf = (overrides: Partial<SocialAuthFlow> = {}): SocialAuthFlow => ({
  state: 'el-state',
  nonce: 'el-nonce',
  provider: 'google',
  expiresAt: new Date(NOW.getTime() + 600_000),
  userId: null,
  exchangeCodeHash: null,
  consumedAt: null,
  codeVerifier: 'verifier-del-intento',
  ...overrides,
});

const googlePort = (configured = true): GoogleWebFlowPort => ({
  isConfigured: () => configured,
  exchange: () => Promise.resolve('el.id.token'),
});

const loginPort = (): SocialLoginUseCase =>
  ({ resolveUserId: () => Promise.resolve('user-1') }) as unknown as SocialLoginUseCase;

describe('abrir el intento web de Google', () => {
  it('sin credenciales responde como un tercero caído y no guarda nada', async () => {
    const flows = new FakeFlows();
    const start = new StartGoogleWebFlowUseCase(
      flows,
      settings(),
      googlePort(false),
      new TestClock(NOW),
    );

    await expect(start.execute()).rejects.toThrow(InfrastructureError);
    expect(flows.created).toHaveLength(0);
  });

  it('pide código con PKCE y al navegador solo viaja el reto, no el verifier', async () => {
    const flows = new FakeFlows();
    const start = new StartGoogleWebFlowUseCase(
      flows,
      settings(),
      googlePort(),
      new TestClock(NOW),
    );

    const { authorizationUrl, state } = await start.execute();
    const url = new URL(authorizationUrl);
    const saved = flows.created[0];

    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('prompt')).toBe('select_account');
    expect(url.searchParams.get('state')).toBe(state);
    expect(saved?.provider).toBe('google');
    expect(saved?.expiresAt).toEqual(new Date(NOW.getTime() + 600_000));
    // El reto es el hash del verifier; el verifier se queda en el servidor.
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256')
        .update(saved?.codeVerifier ?? '')
        .digest('base64url'),
    );
    expect(authorizationUrl).not.toContain(saved?.codeVerifier);
    // El nonce sí viaja: va al proveedor y vuelve dentro del ID Token, que es como se ata el
    // token a este intento. Lo que nunca sale del servidor es el verifier.
    expect(url.searchParams.get('nonce')).toBe(saved?.nonce);
  });
});

describe('completar el intento web de Google', () => {
  const complete = (flows: FakeFlows): CompleteGoogleWebFlowUseCase =>
    new CompleteGoogleWebFlowUseCase(flows, googlePort(), loginPort(), new TestClock(NOW));

  it.each([
    ['un state que nadie abrió', null],
    ['un intento de otro proveedor', flowOf({ provider: 'apple' })],
    ['un intento sin verifier guardado', flowOf({ codeVerifier: null })],
  ])('%s no abre sesión', async (_caso, flow) => {
    const flows = new FakeFlows();
    flows.next = flow;

    await expect(complete(flows).execute({ state: 'el-state', code: 'c' })).rejects.toThrow(
      UnauthorizedError,
    );
    expect(flows.attached).toHaveLength(0);
  });

  it('deja listo un código interno que no se guarda en claro', async () => {
    const flows = new FakeFlows();
    flows.next = flowOf();

    const code = await complete(flows).execute({ state: 'el-state', code: 'codigo-de-google' });

    expect(flows.attached[0]?.userId).toBe('user-1');
    // En la base queda el hash: quien lea la tabla no puede canjear el código.
    expect(flows.attached[0]?.codeHash).toBe(createHash('sha256').update(code).digest('hex'));
    expect(flows.attached[0]?.codeHash).not.toContain(code);
  });
});
