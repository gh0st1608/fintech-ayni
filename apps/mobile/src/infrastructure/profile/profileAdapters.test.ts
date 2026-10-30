import { OtpVerificationError } from '@/domain/auth/errors/OtpVerificationError';
import { LoginIdentifier } from '@/domain/auth/value-objects/LoginIdentifier';
import { OtpCode } from '@/domain/auth/value-objects/OtpCode';
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

const ME = {
  id: 'u-1',
  email: 'ana@mail.com',
  phone: null,
  status: 'active',
  preferredLanguage: 'es',
  firstName: 'Ana',
  lastName: 'Quispe',
  fullName: 'Ana Quispe',
  monthlyPayInLimit: { amount: 105000, currency: 'PEN' },
};

describe('UserProfileApiRepository: perfil y contacto (COPAYNI-44 y 45)', () => {
  it('lee el perfil con el límite como Money y guarda nombre y apellido', async () => {
    const read = setup(json({ success: true, data: ME }));
    const profile = await read.repository.getProfile();
    expect(profile.monthlyPayInLimit?.amount).toBe(105000);
    expect(profile.fullName).toBe('Ana Quispe');

    const save = setup(json({ success: true, data: { ...ME, firstName: 'Rosa' } }));
    await save.repository.updatePersonalInfo({ firstName: 'Rosa', lastName: 'Quispe' });
    const [, init] = save.fetchImpl.mock.calls[0] ?? [];
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ firstName: 'Rosa', lastName: 'Quispe' });
  });

  it('el código rechazado llega como OtpVerificationError', async () => {
    const { repository } = setup(
      json({ success: false, error: { code: 'OTP_INVALID', message: 'x' } }, 422),
    );
    await expect(
      repository.verifyContactChange('c-1', OtpCode.create('1234')),
    ).rejects.toBeInstanceOf(OtpVerificationError);
  });

  it('pide el código para el dato nuevo', async () => {
    const { fetchImpl, repository } = setup(
      json({
        success: true,
        data: {
          challengeId: 'c-1',
          channel: 'email',
          maskedDestination: 'nu***om',
          expiresAt: '2026-10-30T15:05:00.000Z',
          resendAvailableAt: '2026-10-30T15:00:30.000Z',
        },
      }),
    );
    const challenge = await repository.startContactChange(LoginIdentifier.create('nueva@mail.com'));
    expect(challenge.challengeId).toBe('c-1');
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://api.test/v1/me/contact/start');
    expect(JSON.parse(String(init?.body))).toEqual({ identifier: 'nueva@mail.com', type: 'email' });
  });
});
