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
      /VITE_API_URL debe ser la URL del backend[\s\S]*VITE_AUTH_MODE admite solo "dev"/,
    );
  });

  it('arma el contenedor con los adaptadores reales', () => {
    const container = createAppContainer(parseConfig(viteEnv));
    expect(Object.keys(container.circles)).toEqual(['list', 'get', 'setPause']);
  });
});
