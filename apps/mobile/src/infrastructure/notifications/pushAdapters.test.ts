import type { HttpBodyRequestOptions, HttpClientPort } from '@/domain/shared/ports/HttpClientPort';

import { PushApiRepository } from './PushApiRepository';

const PREFERENCES = {
  pushEnabled: true,
  categories: { payments: true, circles: false, account: true },
};

function httpReturning(data: unknown) {
  const calls: { path: string; options: HttpBodyRequestOptions<unknown> }[] = [];
  const respond = (path: string, options: HttpBodyRequestOptions<unknown> = {}) => {
    calls.push({ path, options });
    return Promise.resolve(options.parse ? options.parse(data) : data);
  };
  return {
    http: {
      get: jest.fn(respond),
      post: jest.fn(respond),
      put: jest.fn(respond),
      delete: jest.fn(respond),
    } as unknown as HttpClientPort,
    calls,
  };
}

describe('PushApiRepository (COPAYNI-85)', () => {
  it('registra el dispositivo con su token y plataforma', async () => {
    const { http, calls } = httpReturning(undefined);
    await new PushApiRepository(http).registerDevice({
      token: 'ExponentPushToken[abc]',
      platform: 'ios',
    });
    expect(calls[0]?.path).toBe('/me/devices');
    expect(calls[0]?.options.body).toEqual({ token: 'ExponentPushToken[abc]', platform: 'ios' });
  });

  it('da de baja el token escapándolo en la ruta', async () => {
    const { http, calls } = httpReturning(undefined);
    // Los corchetes del token de Expo no pueden ir crudos en la URL.
    await new PushApiRepository(http).unregisterDevice('ExponentPushToken[a b]');
    expect(calls[0]?.path).toBe('/me/devices/ExponentPushToken%5Ba%20b%5D');
  });

  it('lee las preferencias y las valida', async () => {
    const { http, calls } = httpReturning(PREFERENCES);
    await expect(new PushApiRepository(http).preferences()).resolves.toEqual(PREFERENCES);
    expect(calls[0]?.path).toBe('/me/notification-preferences');
  });

  it('rechaza una respuesta sin las categorías esperadas', async () => {
    const { http } = httpReturning({ pushEnabled: true, categories: { payments: true } });
    await expect(new PushApiRepository(http).preferences()).rejects.toThrow();
  });

  it('guarda un cambio parcial y devuelve cómo quedaron', async () => {
    const { http, calls } = httpReturning(PREFERENCES);
    await expect(
      new PushApiRepository(http).savePreferences({ categories: { circles: false } }),
    ).resolves.toEqual(PREFERENCES);
    expect(calls[0]?.options.body).toEqual({ categories: { circles: false } });
  });
});
