import { OtpVerificationError } from '@/domain/auth/errors/OtpVerificationError';
import { LoginIdentifier } from '@/domain/auth/value-objects/LoginIdentifier';
import { OtpCode } from '@/domain/auth/value-objects/OtpCode';
import { AppError } from '@/domain/shared/errors/AppError';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';

import { AuthApiRepository } from './AuthApiRepository';
import { FAKE_OTP_CODE, InMemoryAuthApi, maskDestination } from './InMemoryAuthApi';

const CHALLENGE = {
  challengeId: 'ch-1',
  channel: 'email',
  maskedDestination: 'a***@mail.com',
  expiresAt: '2026-10-26T15:05:00.000Z',
  resendAvailableAt: '2026-10-26T15:00:30.000Z',
};

function respond(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function setup() {
  const fetchImpl = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  const http = new FetchHttpClient({
    baseUrl: 'https://api.test/v1',
    timeoutMs: 1000,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { fetchImpl, repository: new AuthApiRepository(http) };
}

function requestOf(fetchImpl: jest.Mock) {
  const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
  return { url, body: JSON.parse(String(init.body)) as unknown };
}

describe('AuthApiRepository', () => {
  it('startAuthentication envía el identificador normalizado y mapea el desafío', async () => {
    const { fetchImpl, repository } = setup();
    fetchImpl.mockResolvedValue(respond({ success: true, data: CHALLENGE }));

    const challenge = await repository.startAuthentication(LoginIdentifier.create('Ana@Mail.com'));

    expect(requestOf(fetchImpl)).toEqual({
      url: 'https://api.test/v1/auth/start',
      body: { identifier: 'ana@mail.com', type: 'email' },
    });
    expect(challenge).toEqual({
      ...CHALLENGE,
      expiresAt: new Date(CHALLENGE.expiresAt),
      resendAvailableAt: new Date(CHALLENGE.resendAvailableAt),
    });
  });

  it('rechaza una respuesta que no cumple el contrato', async () => {
    const { fetchImpl, repository } = setup();
    fetchImpl.mockResolvedValue(respond({ success: true, data: { ...CHALLENGE, channel: 'fax' } }));
    await expect(
      repository.startAuthentication(LoginIdentifier.create('ana@mail.com')),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('propaga el rate limit con los segundos de espera', async () => {
    const { fetchImpl, repository } = setup();
    fetchImpl.mockResolvedValue(
      respond({ success: false, error: { code: 'RATE_LIMITED' } }, 429, { 'Retry-After': '42' }),
    );
    await expect(
      repository.startAuthentication(LoginIdentifier.create('ana@mail.com')),
    ).rejects.toMatchObject({ kind: 'rate_limited', retryAfterSeconds: 42 });
  });

  it('verifyOtp canjea el código por los tokens', async () => {
    const { fetchImpl, repository } = setup();
    fetchImpl.mockResolvedValue(
      respond({ success: true, data: { accessToken: 'a1', refreshToken: 'r1' } }),
    );

    const tokens = await repository.verifyOtp('ch-1', OtpCode.create('1234'));

    expect(requestOf(fetchImpl)).toEqual({
      url: 'https://api.test/v1/auth/verify',
      body: { challengeId: 'ch-1', code: '1234' },
    });
    expect(tokens).toMatchObject({ accessToken: 'a1', refreshToken: 'r1' });
  });

  it.each([
    ['OTP_INVALID', 'invalid', { attemptsRemaining: '2' }, 2],
    ['OTP_EXPIRED', 'expired', undefined, undefined],
    ['OTP_ATTEMPTS_EXCEEDED', 'attempts_exceeded', undefined, undefined],
  ])('mapea %s a un rechazo tipado', async (code, reason, details, attemptsRemaining) => {
    const { fetchImpl, repository } = setup();
    fetchImpl.mockResolvedValue(respond({ success: false, error: { code, details } }, 422));

    const error = await repository.verifyOtp('ch-1', OtpCode.create('0000')).catch((e) => e);

    expect(error).toBeInstanceOf(OtpVerificationError);
    expect(error).toMatchObject({ reason, attemptsRemaining });
  });

  it('otros fallos de verify se propagan tal cual', async () => {
    const { fetchImpl, repository } = setup();
    fetchImpl.mockRejectedValue(new TypeError('Network request failed'));
    const error = await repository.verifyOtp('ch-1', OtpCode.create('1234')).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ kind: 'network' });
  });

  it('resendOtp devuelve el nuevo desafío', async () => {
    const { fetchImpl, repository } = setup();
    fetchImpl.mockResolvedValue(respond({ success: true, data: CHALLENGE }));
    await expect(repository.resendOtp('ch-1')).resolves.toMatchObject({ challengeId: 'ch-1' });
    expect(requestOf(fetchImpl)).toMatchObject({
      url: 'https://api.test/v1/auth/resend',
      body: { challengeId: 'ch-1' },
    });
  });
});

describe('InMemoryAuthApi', () => {
  const NOW = new Date('2026-10-26T15:00:00.000Z');

  function fakeApi(now = () => NOW) {
    return new InMemoryAuthApi({ latencyMs: 0, maxAttempts: 2, resendCooldownSeconds: 30, now });
  }

  it('enmascara email y teléfono como el backend', () => {
    expect(maskDestination(LoginIdentifier.create('ana@mail.com'))).toBe('a***@mail.com');
    expect(maskDestination(LoginIdentifier.create('+51987654321'))).toBe('+51 ••• ••• 321');
  });

  it('acepta el código de prueba una sola vez', async () => {
    const api = fakeApi();
    const { challengeId, channel } = await api.startAuthentication(
      LoginIdentifier.create('+51987654321'),
    );
    expect(channel).toBe('sms');
    await expect(api.verifyOtp(challengeId, OtpCode.create(FAKE_OTP_CODE))).resolves.toBeTruthy();
    await expect(api.verifyOtp(challengeId, OtpCode.create(FAKE_OTP_CODE))).rejects.toMatchObject({
      reason: 'expired',
    });
  });

  it('descuenta intentos y bloquea al agotarlos', async () => {
    const api = fakeApi();
    const { challengeId } = await api.startAuthentication(LoginIdentifier.create('ana@mail.com'));
    await expect(api.verifyOtp(challengeId, OtpCode.create('0000'))).rejects.toMatchObject({
      reason: 'invalid',
      attemptsRemaining: 1,
    });
    await expect(api.verifyOtp(challengeId, OtpCode.create('0000'))).rejects.toMatchObject({
      reason: 'attempts_exceeded',
    });
    await expect(api.verifyOtp(challengeId, OtpCode.create(FAKE_OTP_CODE))).rejects.toMatchObject({
      reason: 'attempts_exceeded',
    });
  });

  it('un código vencido se rechaza', async () => {
    let now = NOW;
    const api = fakeApi(() => now);
    const { challengeId } = await api.startAuthentication(LoginIdentifier.create('ana@mail.com'));
    now = new Date(NOW.getTime() + 301_000);
    await expect(api.verifyOtp(challengeId, OtpCode.create(FAKE_OTP_CODE))).rejects.toMatchObject({
      reason: 'expired',
    });
  });

  it('el reenvío respeta la espera y luego reinicia intentos y plazos', async () => {
    let now = NOW;
    const api = fakeApi(() => now);
    const { challengeId } = await api.startAuthentication(LoginIdentifier.create('ana@mail.com'));

    await expect(api.resendOtp(challengeId)).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterSeconds: 30,
    });

    now = new Date(NOW.getTime() + 30_000);
    const next = await api.resendOtp(challengeId);
    expect(next.resendAvailableAt.getTime()).toBe(now.getTime() + 30_000);
    await expect(api.resendOtp('desconocido')).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('respeta la cancelación', async () => {
    const api = new InMemoryAuthApi({ latencyMs: 1000 });
    const controller = new AbortController();
    const pending = api.startAuthentication(
      LoginIdentifier.create('ana@mail.com'),
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });

    await expect(
      api.startAuthentication(LoginIdentifier.create('ana@mail.com'), controller.signal),
    ).rejects.toMatchObject({ kind: 'cancelled' });
  });
});
