import { SessionEvents } from '@/application/auth/SessionEvents';
import { OtpVerificationError } from '@/domain/auth/errors/OtpVerificationError';
import { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';
import { InvalidLoginIdentifierError } from '@/domain/auth/value-objects/LoginIdentifier';
import { InvalidOtpCodeError } from '@/domain/auth/value-objects/OtpCode';
import { AppError } from '@/domain/shared/errors/AppError';
import { FAKE_OTP_CODE, InMemoryAuthApi } from '@/infrastructure/auth/InMemoryAuthApi';
import { InMemoryTokenStorage } from '@test/fakes/ports';

import { RefreshSessionUseCase } from './RefreshSessionUseCase';
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
  const api = () => new InMemoryAuthApi({ latencyMs: 0 });

  it('al cerrar el usuario revoca el refresh token y borra las credenciales', async () => {
    const authApi = api();
    const logout = jest.spyOn(authApi, 'logout');
    const storage = new InMemoryTokenStorage();
    storage.tokens = tokens();
    await expect(new SignOutUseCase(storage, authApi).execute()).resolves.toBe('unauthenticated');
    expect(logout).toHaveBeenCalledWith('r1');
    expect(storage.tokens).toBeNull();
  });

  it('cierra la sesión local sin esperar a la red', async () => {
    const authApi = api();
    jest.spyOn(authApi, 'logout').mockReturnValue(new Promise(() => {}));
    const storage = new InMemoryTokenStorage();
    storage.tokens = tokens();
    await expect(new SignOutUseCase(storage, authApi).execute()).resolves.toBe('unauthenticated');
    expect(storage.tokens).toBeNull();
  });

  it('un almacén ilegible no impide cerrar la sesión', async () => {
    const authApi = api();
    const logout = jest.spyOn(authApi, 'logout');
    const storage = new InMemoryTokenStorage();
    storage.failOnRead = true;
    await expect(new SignOutUseCase(storage, authApi).execute()).resolves.toBe('unauthenticated');
    expect(logout).not.toHaveBeenCalled();
  });

  it('un fallo de red al revocar no impide cerrar la sesión local', async () => {
    const authApi = api();
    jest.spyOn(authApi, 'logout').mockRejectedValue(new AppError('network', 'offline'));
    const storage = new InMemoryTokenStorage();
    storage.tokens = tokens();
    await new SignOutUseCase(storage, authApi).execute();
    expect(storage.tokens).toBeNull();
  });

  it('la expiración no llama al backend', async () => {
    const authApi = api();
    const logout = jest.spyOn(authApi, 'logout');
    const storage = new InMemoryTokenStorage();
    storage.tokens = tokens();
    await expect(new SignOutUseCase(storage, authApi).execute('expired')).resolves.toBe(
      'sessionExpired',
    );
    expect(logout).not.toHaveBeenCalled();
  });

  it('propaga el fallo si no puede borrar las credenciales', async () => {
    const storage = new InMemoryTokenStorage();
    storage.clear = jest.fn().mockRejectedValue(new Error('keychain'));
    await expect(new SignOutUseCase(storage, api()).execute()).rejects.toThrow('keychain');
  });
});

describe('RefreshSessionUseCase', () => {
  async function refreshSetup() {
    const authApi = new InMemoryAuthApi({ latencyMs: 0 });
    const storage = new InMemoryTokenStorage();
    const events = new SessionEvents();
    const listener = jest.fn();
    events.subscribe(listener);
    const refresh = new RefreshSessionUseCase(
      authApi,
      storage,
      new SignOutUseCase(storage, authApi),
      events,
    );
    // Sesión real emitida por la API falsa: OTP correcto con Remember Me desmarcado.
    const { challengeId } = await new StartAuthenticationUseCase(authApi).execute('ana@mail.com');
    await new VerifyOtpUseCase(authApi, storage).execute({
      challengeId,
      code: FAKE_OTP_CODE,
      rememberMe: false,
    });
    return { authApi, storage, refresh, listener };
  }

  it('rota los tokens conservando la elección de Remember Me', async () => {
    const { storage, refresh } = await refreshSetup();
    const before = storage.tokens;
    await expect(refresh.execute()).resolves.toBe(true);
    expect(storage.tokens?.refreshToken).not.toBe(before?.refreshToken);
    expect(storage.persisted).toBe(false);
  });

  it('las renovaciones concurrentes comparten una sola llamada', async () => {
    const { authApi, refresh } = await refreshSetup();
    const spy = jest.spyOn(authApi, 'refreshSession');
    const results = await Promise.all([1, 2, 3, 4].map(() => refresh.execute()));
    expect(results).toEqual([true, true, true, true]);
    expect(spy).toHaveBeenCalledTimes(1);
    // Terminada la anterior, una nueva renovación vuelve a llamar.
    await refresh.execute();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('si el backend rechaza el refresh token, la sesión expira sin reintentar', async () => {
    const { authApi, storage, refresh, listener } = await refreshSetup();
    authApi.revokeAllSessions();
    const spy = jest.spyOn(authApi, 'refreshSession');
    await expect(refresh.execute()).resolves.toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(storage.tokens).toBeNull();
    expect(listener).toHaveBeenCalledWith('sessionExpired');
  });

  it('sin tokens guardados expira sin llamar a la API', async () => {
    const { authApi, storage, refresh, listener } = await refreshSetup();
    storage.tokens = null;
    const spy = jest.spyOn(authApi, 'refreshSession');
    await expect(refresh.execute()).resolves.toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith('sessionExpired');
  });

  it('un fallo transitorio se propaga sin cerrar la sesión', async () => {
    const { authApi, storage, refresh, listener } = await refreshSetup();
    jest.spyOn(authApi, 'refreshSession').mockRejectedValue(new AppError('network', 'offline'));
    await expect(refresh.execute()).rejects.toMatchObject({ kind: 'network' });
    expect(storage.tokens).not.toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  it('avisa la expiración aunque falle el borrado local', async () => {
    const { storage, refresh, listener } = await refreshSetup();
    storage.clear = jest.fn().mockRejectedValue(new Error('keychain'));
    await expect(refresh.expire()).rejects.toThrow('keychain');
    expect(listener).toHaveBeenCalledWith('sessionExpired');
  });
});

describe('SessionEvents', () => {
  it('deja de avisar tras cancelar la suscripción', () => {
    const events = new SessionEvents();
    const listener = jest.fn();
    const unsubscribe = events.subscribe(listener);
    unsubscribe();
    events.emit('sessionExpired');
    expect(listener).not.toHaveBeenCalled();
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
