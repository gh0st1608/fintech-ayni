import { OtpVerificationError } from '@/domain/auth/errors/OtpVerificationError';
import { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';
import { InvalidLoginIdentifierError } from '@/domain/auth/value-objects/LoginIdentifier';
import { InvalidOtpCodeError } from '@/domain/auth/value-objects/OtpCode';
import { FAKE_OTP_CODE, InMemoryAuthApi } from '@/infrastructure/auth/InMemoryAuthApi';
import { InMemoryTokenStorage } from '@test/fakes/ports';

import { ResendOtpUseCase } from './ResendOtpUseCase';
import { RestoreSessionUseCase } from './RestoreSessionUseCase';
import { SignOutUseCase } from './SignOutUseCase';
import { StartAuthenticationUseCase } from './StartAuthenticationUseCase';
import { VerifyOtpUseCase } from './VerifyOtpUseCase';

const tokens = () => AuthTokens.create({ accessToken: 'a1', refreshToken: 'r1' });

describe('RestoreSessionUseCase', () => {
  it('autentica si hay credenciales guardadas', async () => {
    const storage = new InMemoryTokenStorage();
    storage.tokens = tokens();
    await expect(new RestoreSessionUseCase(storage).execute()).resolves.toBe('authenticated');
  });

  it('no autentica sin credenciales', async () => {
    await expect(new RestoreSessionUseCase(new InMemoryTokenStorage()).execute()).resolves.toBe(
      'unauthenticated',
    );
  });

  it('trata un almacén ilegible como sesión ausente', async () => {
    const storage = new InMemoryTokenStorage();
    storage.failOnRead = true;
    await expect(new RestoreSessionUseCase(storage).execute()).resolves.toBe('unauthenticated');
  });
});

describe('SignOutUseCase', () => {
  it('borra las credenciales; por defecto la sesión queda cerrada', async () => {
    const storage = new InMemoryTokenStorage();
    storage.tokens = tokens();
    await expect(new SignOutUseCase(storage).execute()).resolves.toBe('unauthenticated');
    expect(storage.tokens).toBeNull();
  });

  it('distingue la expiración de sesión del cierre voluntario', async () => {
    await expect(new SignOutUseCase(new InMemoryTokenStorage()).execute('expired')).resolves.toBe(
      'sessionExpired',
    );
  });

  it('propaga el fallo si no puede borrar las credenciales', async () => {
    const storage = new InMemoryTokenStorage();
    storage.clear = jest.fn().mockRejectedValue(new Error('keychain'));
    await expect(new SignOutUseCase(storage).execute()).rejects.toThrow('keychain');
  });
});

function authSetup() {
  const authApi = new InMemoryAuthApi({ latencyMs: 0, resendCooldownSeconds: 0 });
  const storage = new InMemoryTokenStorage();
  return {
    authApi,
    storage,
    start: new StartAuthenticationUseCase(authApi),
    verify: new VerifyOtpUseCase(authApi, storage),
    resend: new ResendOtpUseCase(authApi),
  };
}

describe('StartAuthenticationUseCase', () => {
  it('normaliza el identificador y devuelve el desafío con el destino enmascarado', async () => {
    const { authApi, start } = authSetup();
    const spy = jest.spyOn(authApi, 'startAuthentication');
    const challenge = await start.execute(' Ana@Mail.com ');
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ kind: 'email', value: 'ana@mail.com' });
    expect(challenge).toMatchObject({ channel: 'email', maskedDestination: 'a***@mail.com' });
  });

  it('un formato inválido no llega a la API', async () => {
    const { authApi, start } = authSetup();
    const spy = jest.spyOn(authApi, 'startAuthentication');
    await expect(start.execute('ana@')).rejects.toThrow(InvalidLoginIdentifierError);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('VerifyOtpUseCase', () => {
  it('con Remember Me guarda la sesión de forma persistente', async () => {
    const { start, verify, storage } = authSetup();
    const { challengeId } = await start.execute('ana@mail.com');
    await expect(
      verify.execute({ challengeId, code: FAKE_OTP_CODE, rememberMe: true }),
    ).resolves.toBe('authenticated');
    expect(storage.tokens).not.toBeNull();
    expect(storage.persisted).toBe(true);
  });

  it('sin Remember Me guarda la sesión solo en memoria', async () => {
    const { start, verify, storage } = authSetup();
    const { challengeId } = await start.execute('+51987654321');
    await verify.execute({ challengeId, code: FAKE_OTP_CODE, rememberMe: false });
    expect(storage.persisted).toBe(false);
  });

  it('un código con formato inválido no llega a la API', async () => {
    const { authApi, verify } = authSetup();
    const spy = jest.spyOn(authApi, 'verifyOtp');
    await expect(
      verify.execute({ challengeId: 'c', code: '12', rememberMe: true }),
    ).rejects.toThrow(InvalidOtpCodeError);
    expect(spy).not.toHaveBeenCalled();
  });

  it('propaga el rechazo del backend sin abrir la sesión', async () => {
    const { start, verify, storage } = authSetup();
    const { challengeId } = await start.execute('ana@mail.com');
    await expect(
      verify.execute({ challengeId, code: '0000', rememberMe: true }),
    ).rejects.toBeInstanceOf(OtpVerificationError);
    expect(storage.tokens).toBeNull();
  });
});

describe('ResendOtpUseCase', () => {
  it('emite un desafío nuevo para el mismo identificador', async () => {
    const { start, resend } = authSetup();
    const first = await start.execute('ana@mail.com');
    const next = await resend.execute(first.challengeId);
    expect(next).toMatchObject({
      challengeId: first.challengeId,
      maskedDestination: 'a***@mail.com',
    });
  });
});
