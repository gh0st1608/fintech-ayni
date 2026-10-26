import { AuthTokens, InvalidAuthTokensError } from '@/domain/auth/value-objects/AuthTokens';

import { InMemoryTokenStorage } from '@test/fakes/ports';

import { RestoreSessionUseCase } from './RestoreSessionUseCase';
import { SignInUseCase } from './SignInUseCase';
import { SignOutUseCase } from './SignOutUseCase';

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

describe('SignInUseCase', () => {
  it('guarda las credenciales validadas y abre la sesión', async () => {
    const storage = new InMemoryTokenStorage();
    await expect(
      new SignInUseCase(storage).execute({ accessToken: ' a1 ', refreshToken: 'r1' }),
    ).resolves.toBe('authenticated');
    expect(storage.tokens).toMatchObject({ accessToken: 'a1', refreshToken: 'r1' });
  });

  it('rechaza credenciales vacías sin persistir nada', async () => {
    const storage = new InMemoryTokenStorage();
    await expect(
      new SignInUseCase(storage).execute({ accessToken: '', refreshToken: 'r1' }),
    ).rejects.toThrow(InvalidAuthTokensError);
    expect(storage.tokens).toBeNull();
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
