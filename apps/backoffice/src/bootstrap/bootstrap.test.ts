import { viteEnv } from '@/bootstrap/viteEnv';

import { createAppContainer } from './container';
import { parseConfig } from './env';

describe('configuración', () => {
  it('acepta la configuración de desarrollo', () => {
    expect(parseConfig(viteEnv)).toEqual({
      apiUrl: 'http://api.test',
      authMode: 'dev',
      httpTimeoutMs: 5000,
    });
  });

  it('usa 15 s de timeout por defecto', () => {
    expect(
      parseConfig({ VITE_API_URL: 'http://api.test', VITE_AUTH_MODE: 'dev' }).httpTimeoutMs,
    ).toBe(15_000);
  });

  it('falla con un mensaje claro si falta algo', () => {
    expect(() => parseConfig({ VITE_AUTH_MODE: 'oidc' })).toThrow(
      /VITE_API_URL debe ser la URL del backend/,
    );
  });

  it('acepta configuración OIDC completa', () => {
    expect(
      parseConfig({
        VITE_API_URL: 'http://api.test',
        VITE_AUTH_MODE: 'oidc',
        VITE_OIDC_ISSUER: 'https://identitycenter.amazonaws.com/ssoins-722326feeecaf3f6',
        VITE_OIDC_CLIENT_ID: 'my-client-id',
        VITE_OIDC_REDIRECT_URI: 'http://localhost:5173/auth/callback',
      }),
    ).toMatchObject({
      authMode: 'oidc',
      oidc: {
        issuer: 'https://identitycenter.amazonaws.com/ssoins-722326feeecaf3f6',
        clientId: 'my-client-id',
        redirectUri: 'http://localhost:5173/auth/callback',
      },
    });
  });

  it('falla en modo oidc si faltan los parámetros OIDC', () => {
    expect(() => parseConfig({ VITE_API_URL: 'http://api.test', VITE_AUTH_MODE: 'oidc' })).toThrow(
      /VITE_OIDC_ISSUER es requerida en modo oidc/,
    );
  });

  it('arma el contenedor con los adaptadores reales', () => {
    const container = createAppContainer(parseConfig(viteEnv));
    expect(Object.keys(container.circles)).toEqual(['list', 'get', 'setPause']);
  });
});
