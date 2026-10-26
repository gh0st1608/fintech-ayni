import * as SecureStore from 'expo-secure-store';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

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

  it('entrar en modo demo y cerrar sesión cambian de área sin loops', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await fireEvent.press(await screen.findByText('Entrar en modo demo'));
    await waitFor(() => expect(screen).toHavePathname('/home'));

    await fireEvent.press(screen.getAllByText('Perfil')[0]!);
    await fireEvent.press(await screen.findByText('Cerrar sesión'));
    expect(await screen.findByText('Bienvenido a Ayni')).toBeTruthy();
  });
});
