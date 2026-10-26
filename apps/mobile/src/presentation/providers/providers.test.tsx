import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';
import { createI18n } from '@/presentation/i18n/createI18n';
import { useLanguage } from '@/presentation/i18n/useLanguage';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { FakeLayoutDirection } from '@test/fakes/ports';

import { ContainerProvider, useContainer } from './ContainerProvider';
import { SessionProvider, useSession } from './SessionProvider';

function renderSession(setup = createTestContainer(), queryClient = new QueryClient()) {
  return renderHook(() => useSession(), {
    wrapper: ({ children }) => (
      <ContainerProvider container={setup.container}>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>{children}</SessionProvider>
        </QueryClientProvider>
      </ContainerProvider>
    ),
  });
}

describe('SessionProvider', () => {
  it('permanece en checking mientras se restaura la sesión', async () => {
    const setup = createTestContainer();
    jest
      .spyOn(setup.container.auth.restoreSession, 'execute')
      .mockReturnValue(new Promise(() => {}));
    const { result } = await renderSession(setup);
    expect(result.current.status).toBe('checking');
  });

  it('restaura una sesión existente', async () => {
    const setup = createTestContainer();
    setup.adapters.tokenStorage.tokens = AuthTokens.create({ accessToken: 'a', refreshToken: 'r' });
    const { result } = await renderSession(setup);
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
  });

  it('completeSignIn abre la sesión y signOut la cierra limpiando la caché remota', async () => {
    const setup = createTestContainer();
    const queryClient = new QueryClient();
    queryClient.setQueryData(['me'], { name: 'x' });
    const { result } = await renderSession(setup, queryClient);
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    setup.adapters.tokenStorage.tokens = AuthTokens.create({
      accessToken: 'a1',
      refreshToken: 'r1',
    });
    await act(() => result.current.completeSignIn('authenticated'));
    expect(result.current.status).toBe('authenticated');

    await act(() => result.current.signOut());
    expect(result.current.status).toBe('unauthenticated');
    expect(setup.adapters.tokenStorage.tokens).toBeNull();
    expect(queryClient.getQueryData(['me'])).toBeUndefined();
  });

  it('exige estar dentro de su provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHook(() => useSession())).rejects.toThrow(/SessionProvider/);
    await expect(renderHook(() => useContainer())).rejects.toThrow(/ContainerProvider/);
  });
});

describe('useLanguage', () => {
  it('cambia el idioma en caliente y persiste la preferencia', async () => {
    const layoutDirection = new FakeLayoutDirection('ltr');
    const setup = createTestContainer({ layoutDirection });
    const i18n = await createI18n('es', 'es');
    const { result } = await renderHook(() => useLanguage(), {
      wrapper: ({ children }) => (
        <ContainerProvider container={setup.container}>
          <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
        </ContainerProvider>
      ),
    });

    expect(result.current.language).toBe('es');
    expect(result.current.languages.map(({ code }) => code)).toEqual(['es', 'en']);

    await act(async () => {
      await expect(result.current.changeLanguage('en')).resolves.toEqual({
        requiresRestart: false,
      });
    });
    expect(result.current.language).toBe('en');
    expect(i18n.t('profile.logout')).toBe('Log out');
    expect(setup.adapters.languagePreference.stored).toBe('en');
    expect(layoutDirection.applied).toEqual([]);
  });
});
