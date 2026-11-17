import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { SocialSignInResult } from '@/domain/auth/SocialLogin';
import { FakeSocialSignIn } from '@/infrastructure/auth/ExpoSocialSignIn';
import { InMemorySocialAuthApi } from '@/infrastructure/auth/InMemorySocialAuthApi';
import { AppError } from '@/domain/shared/errors/AppError';
import { SignInScreen } from '@/presentation/auth/screens/SignInScreen';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

/** Entrar con Google o Apple (COPAYNI-91). */
function setup(options: { available?: ('google' | 'apple')[]; result?: SocialSignInResult } = {}) {
  const socialSignIn = new FakeSocialSignIn({
    available: options.available,
    result: options.result,
  });
  const socialAuthApi = new InMemorySocialAuthApi();
  return {
    ...createTestContainer({ socialSignIn, socialAuthApi }),
    socialSignIn,
    socialAuthApi,
  };
}

const renderSignIn = (test = setup()) =>
  renderWithProviders(<SignInScreen onChallengeStarted={jest.fn()} />, test).then((view) => ({
    ...view,
    ...test,
  }));

describe('login social en el ingreso', () => {
  it('ofrece los proveedores que el teléfono puede usar', async () => {
    await renderSignIn(setup({ available: ['google'] }));

    expect(await screen.findByTestId('social-login-google')).toBeTruthy();
    expect(screen.queryByTestId('social-login-apple')).toBeNull();
    expect(screen.getByText('o entra con')).toBeTruthy();
  });

  it('sin proveedores disponibles, la sección no aparece', async () => {
    await renderSignIn(setup({ available: [] }));

    // El ingreso con email o teléfono sigue igual.
    expect(await screen.findByLabelText(/correo|email/i)).toBeTruthy();
    expect(screen.queryByTestId('social-login')).toBeNull();
  });

  it('entra con Google: canjea la credencial por la sesión de Ayni', async () => {
    const test = setup({ available: ['google', 'apple'] });
    await renderSignIn(test);

    fireEvent.press(await screen.findByTestId('social-login-google'));

    await waitFor(() => expect(test.socialAuthApi.logins).toHaveLength(1));
    expect(test.socialAuthApi.logins[0]).toMatchObject({ provider: 'google' });
    // El nonce del intento viaja con la credencial: el backend lo exige.
    expect(test.socialAuthApi.logins[0]?.nonce).toEqual(expect.any(String));
    const stored = await test.adapters.tokenStorage.read();
    expect(stored?.accessToken).toBe('access-social');
  });

  it('Apple en Android llega con un código del backend y se canjea', async () => {
    const test = setup({
      available: ['apple'],
      result: { status: 'session', exchangeCode: 'codigo-interno' },
    });
    await renderSignIn(test);

    fireEvent.press(await screen.findByTestId('social-login-apple'));

    await waitFor(() => expect(test.socialAuthApi.exchanges).toEqual(['codigo-interno']));
    expect(test.socialAuthApi.logins).toHaveLength(0);
  });

  it('cancelar no deja mensaje de error ni abre sesión', async () => {
    const test = setup({ available: ['google'], result: { status: 'cancelled' } });
    await renderSignIn(test);

    fireEvent.press(await screen.findByTestId('social-login-google'));

    await waitFor(() => expect(test.socialSignIn.attempts).toEqual(['google']));
    expect(test.socialAuthApi.logins).toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(await test.adapters.tokenStorage.read()).toBeNull();
  });

  it('si el backend rechaza la credencial, lo dice sin dejar la pantalla a medias', async () => {
    const test = setup({ available: ['google'] });
    test.socialAuthApi.failWith = new AppError('unauthorized', 'No pudimos verificar tu cuenta');
    await renderSignIn(test);

    fireEvent.press(await screen.findByTestId('social-login-google'));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(await test.adapters.tokenStorage.read()).toBeNull();
  });

  it('un proveedor que este build no soporta lo explica en vez de fallar', async () => {
    const test = setup({ available: ['apple'], result: { status: 'unsupported' } });
    await renderSignIn(test);

    fireEvent.press(await screen.findByTestId('social-login-apple'));

    expect(
      await screen.findByText('Ese proveedor no está disponible en este teléfono.'),
    ).toBeTruthy();
    expect(test.socialAuthApi.logins).toHaveLength(0);
  });
});
