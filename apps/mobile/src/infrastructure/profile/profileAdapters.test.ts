import { AppError } from '@/domain/shared/errors/AppError';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';

import { InMemoryUserProfileRepository } from './InMemoryUserProfileRepository';
import { UserProfileApiRepository } from './UserProfileApiRepository';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(response: Response) {
  const fetchImpl = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  fetchImpl.mockResolvedValue(response);
  const http = new FetchHttpClient({
    baseUrl: 'https://api.test/v1',
    timeoutMs: 1000,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { fetchImpl, repository: new UserProfileApiRepository(http) };
}

describe('UserProfileApiRepository', () => {
  it('envía el idioma preferido con PATCH /me', async () => {
    const { fetchImpl, repository } = setup(json({ success: true, data: {} }));
    await repository.updatePreferredLanguage('en');

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://api.test/v1/me');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ preferredLanguage: 'en' });
  });

  it('propaga los fallos como AppError', async () => {
    const { repository } = setup(
      json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'x' } }, 404),
    );
    await expect(repository.updatePreferredLanguage('en')).rejects.toBeInstanceOf(AppError);
  });
});

describe('InMemoryUserProfileRepository', () => {
  it('recuerda el último idioma recibido', async () => {
    const repository = new InMemoryUserProfileRepository({ latencyMs: 0 });
    await repository.updatePreferredLanguage('en');
    expect(repository.preferredLanguage).toBe('en');
  });
});
