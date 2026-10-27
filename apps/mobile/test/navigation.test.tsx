import * as SecureStore from 'expo-secure-store';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { SessionEvents } from '@/application/auth/SessionEvents';
import { FAKE_OTP_CODE } from '@/infrastructure/auth/InMemoryAuthApi';

// Rutas reales de la app: se prueba el shell de navegación completo (COPAYNI-15).
const APP_DIR = './src/app';

// Integración: el primer render transforma todo el árbol de rutas (lento con caché fría en CI).
jest.setTimeout(30_000);

async function storeSession() {
  await SecureStore.setItemAsync('auth.accessToken', 'token');
  await SecureStore.setItemAsync('auth.refreshToken', 'refresh');
}

beforeEach(async () => {
  await SecureStore.deleteItemAsync('auth.accessToken');
  await SecureStore.deleteItemAsync('auth.refreshToken');
});

describe('shell de navegación', () => {
  it('sin sesión muestra la bienvenida pública', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    expect(await screen.findByText('Bienvenido a Ayni')).toBeTruthy();
    expect(screen).toHavePathname('/welcome');
  });

  it('sin sesión no permite abrir rutas privadas', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/profile' });
    expect(await screen.findByText('Bienvenido a Ayni')).toBeTruthy();
    expect(screen.queryByText('Cerrar sesión')).toBeNull();
  });

  it('con sesión restaurada abre las pestañas privadas', async () => {
    await storeSession();
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await waitFor(() => expect(screen).toHavePathname('/home'));
    for (const tab of ['Inicio', 'Círculos', 'Pagos', 'Perfil']) {
      expect(screen.getAllByText(tab).length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['Círculos', '/circles'],
    ['Pagos', '/payment'],
  ])('la pestaña %s abre su pantalla', async (tab, pathname) => {
    await storeSession();
    await renderRouter(APP_DIR, { initialUrl: '/home' });
    await fireEvent.press(screen.getAllByText(tab)[0]!);
    await waitFor(() => expect(screen).toHavePathname(pathname));
    expect(screen.getAllByText('Próximamente').length).toBeGreaterThan(0);
  });

  it('el botón central abre "Elige un servicio"', async () => {
    await storeSession();
    await renderRouter(APP_DIR, { initialUrl: '/home' });
    await fireEvent.press(await screen.findByTestId('join-tab-button'));
    await waitFor(() => expect(screen).toHavePathname('/join'));
  });

  it('bienvenida → ingreso → OTP correcto abre Home; cerrar sesión vuelve a la bienvenida', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen).toHavePathname('/sign-in'));

    await fireEvent.changeText(screen.getByLabelText('Email/Teléfono'), 'ana@mail.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen).toHavePathname('/verify-otp'));
    expect(screen.getByText(/a\*\*\*@mail\.com/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Código de verificación'), FAKE_OTP_CODE);
    await waitFor(() => expect(screen).toHavePathname('/home'), { timeout: 5000 });

    await fireEvent.press(screen.getAllByText('Perfil')[0]!);
    await fireEvent.press(await screen.findByText('Cerrar sesión'));
    expect(await screen.findByText('Bienvenido a Ayni')).toBeTruthy();
  });

  it('una sesión que expira lleva a la bienvenida con el aviso, sin bucles', async () => {
    let notify: ((status: 'sessionExpired') => void) | undefined;
    const subscribe = jest.spyOn(SessionEvents.prototype, 'subscribe');
    subscribe.mockImplementation(function (this: SessionEvents, listener) {
      notify = listener;
      return () => undefined;
    });
    try {
      await storeSession();
      await renderRouter(APP_DIR, { initialUrl: '/home' });
      await waitFor(() => expect(screen).toHavePathname('/home'));

      await act(() => notify?.('sessionExpired'));

      expect(await screen.findByText('Tu sesión expiró. Vuelve a ingresar.')).toBeTruthy();
      expect(screen).toHavePathname('/welcome');
      expect(screen.queryByText('Cerrar sesión')).toBeNull();
    } finally {
      subscribe.mockRestore();
    }
  });

  it('verify-otp sin datos del desafío vuelve al ingreso', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/verify-otp' });
    await waitFor(() => expect(screen).toHavePathname('/sign-in'));
  });

  it('en dev, el perfil abre el catálogo de componentes', async () => {
    await storeSession();
    await renderRouter(APP_DIR, { initialUrl: '/profile' });
    await fireEvent.press(await screen.findByText('Catálogo de componentes (dev)'));
    await waitFor(() => expect(screen).toHavePathname('/catalog'));
    expect(await screen.findByText('Tipografía')).toBeTruthy();
  });

  describe('fuera de dev', () => {
    const original = { ...process.env };
    beforeEach(() => {
      process.env.EXPO_PUBLIC_APP_ENV = 'prod';
      process.env.EXPO_PUBLIC_AUTH_API = 'http';
    });
    afterEach(() => {
      process.env.EXPO_PUBLIC_APP_ENV = original.EXPO_PUBLIC_APP_ENV;
      process.env.EXPO_PUBLIC_AUTH_API = original.EXPO_PUBLIC_AUTH_API;
    });

    it('el catálogo no existe ni se ofrece en el perfil', async () => {
      await storeSession();
      await renderRouter(APP_DIR, { initialUrl: '/catalog' });
      await waitFor(() => expect(screen).not.toHavePathname('/catalog'));
      expect(screen.queryByText('Tipografía')).toBeNull();

      await fireEvent.press(screen.getAllByText('Perfil')[0]!);
      expect(await screen.findByText('Cerrar sesión')).toBeTruthy();
      expect(screen.queryByText('Catálogo de componentes (dev)')).toBeNull();
    });
  });
});
