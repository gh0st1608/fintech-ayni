import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { SessionEvents } from '@/application/auth/SessionEvents';
import { Money } from '@/domain/shared/value-objects/Money';
import { FAKE_OTP_CODE } from '@/infrastructure/auth/InMemoryAuthApi';
import { InMemoryCircleQuoteRepository } from '@/infrastructure/circles/InMemoryCircleQuoteRepository';
import { recommendedCircle } from '@test/fakes/myCircles';

// Rutas reales de la app: se prueba el shell de navegación completo (COPAYNI-15).
const APP_DIR = './src/app';

// Integración: el primer render transforma todo el árbol de rutas (lento con caché fría en CI).
jest.setTimeout(30_000);

async function storeSession() {
  await SecureStore.setItemAsync('auth.accessToken', 'token');
  await SecureStore.setItemAsync('auth.refreshToken', 'refresh');
}

afterEach(() => jest.restoreAllMocks());

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
    // Mis círculos (COPAYNI-26): pestañas Activos y Finalizados.
    ['Círculos', '/circles', 'Activos'],
    // Pagos (COPAYNI-35): sin pagos pendientes, el estado vacío y los accesos.
    ['Pagos', '/payment', 'Historial de pagos'],
  ])('la pestaña %s abre su pantalla', async (tab, pathname, content) => {
    await storeSession();
    await renderRouter(APP_DIR, { initialUrl: '/home' });
    await fireEvent.press(screen.getAllByText(tab)[0]!);
    await waitFor(() => expect(screen).toHavePathname(pathname));
    expect((await screen.findAllByText(content)).length).toBeGreaterThan(0);
  });

  it('"Únete ahora" de un recomendado abre el paso 1 con el monto del círculo', async () => {
    jest
      .spyOn(InMemoryCircleQuoteRepository.prototype, 'listRecommended')
      .mockResolvedValue([recommendedCircle({ payout: Money.fromMajor(45_000, 'PEN') })]);
    await storeSession();
    await renderRouter(APP_DIR, { initialUrl: '/home' });

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Únete ahora' }, { timeout: 5000 }),
    );
    await waitFor(() => expect(screen).toHavePathname('/join/payout-amount'));
    expect(await screen.findByText(/45\.?000/, {}, { timeout: 5000 })).toBeTruthy();
  });

  it('el botón central abre "Elige un servicio"', async () => {
    await storeSession();
    await renderRouter(APP_DIR, { initialUrl: '/home' });
    await fireEvent.press(await screen.findByTestId('join-tab-button'));
    await waitFor(() => expect(screen).toHavePathname('/join'));
  });

  it('Elige un servicio → Game’ya → monto (paso 1) → cuota (paso 2) → turno (paso 3) → paso 4', async () => {
    await storeSession();
    await renderRouter(APP_DIR, { initialUrl: '/join' });
    await fireEvent.press(await screen.findByRole('button', { name: /Unirme a un Game'ya/ }));
    await waitFor(() => expect(screen).toHavePathname('/join/payout-amount'));

    expect(await screen.findByTestId('payout-slider', {}, { timeout: 5000 })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(screen).toHavePathname('/join/monthly-pay-in'));

    // Editar vuelve al paso 1 con el monto conservado.
    await fireEvent.press(await screen.findByRole('button', { name: 'Editar el monto de payout' }));
    await waitFor(() => expect(screen).toHavePathname('/join/payout-amount'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(screen).toHavePathname('/join/monthly-pay-in'));

    // Figma 55:9334: tocar la cuota pasa al turno.
    await fireEvent.press(
      await screen.findByRole('button', { name: /6 meses/ }, { timeout: 5000 }),
    );
    await waitFor(() => expect(screen).toHavePathname('/join/slot'));

    await fireEvent.press(
      await screen.findByTestId('slot-type-fastestPayout', {}, { timeout: 5000 }),
    );
    await fireEvent.press(await screen.findByTestId('slot-1'));
    await fireEvent.press(screen.getByRole('button', { name: /^Continuar con / }));
    await waitFor(() => expect(screen).toHavePathname('/join/payout-method'));

    await fireEvent.press(
      await screen.findByTestId('payout-method-bankTransfer', {}, { timeout: 5000 }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen).toHavePathname('/join/confirm'));

    // Confirmar une al usuario y lleva a Mis círculos con el flujo reiniciado.
    await fireEvent.press(await screen.findByRole('button', { name: 'Confirmar y unirme' }));
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Ver mis círculos' }, { timeout: 5000 }),
    );
    await waitFor(() => expect(screen).toHavePathname('/circles'));
    // La unión invalida Circles > Active: el círculo nuevo aparece con su badge.
    expect(await screen.findByText('Unido', {}, { timeout: 5000 })).toBeTruthy();
  });

  it('Elige un servicio → programa de ahorro', async () => {
    await storeSession();
    await renderRouter(APP_DIR, { initialUrl: '/join' });
    await fireEvent.press(await screen.findByRole('button', { name: /programa de ahorro/ }));
    await waitFor(() => expect(screen).toHavePathname('/join/saving-program'));
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

  it('un enlace de invitación guarda el código válido y sigue a la bienvenida', async () => {
    await AsyncStorage.removeItem('referral.pendingCode');
    await renderRouter(APP_DIR, { initialUrl: '/invite?code=k7m2q9xb' });
    expect(await screen.findByText('Bienvenido a Ayni')).toBeTruthy();
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('referral.pendingCode')).toBe('K7M2Q9XB'),
    );
  });

  it('un enlace de invitación mal formado se ignora sin romper la navegación', async () => {
    await AsyncStorage.removeItem('referral.pendingCode');
    await renderRouter(APP_DIR, { initialUrl: '/invite?code=<script>' });
    expect(await screen.findByText('Bienvenido a Ayni')).toBeTruthy();
    expect(await AsyncStorage.getItem('referral.pendingCode')).toBeNull();
  });

  it('en el comprobante de ingresos, atrás vuelve al paso anterior y desde el primero sale', async () => {
    await storeSession();
    await renderRouter(APP_DIR, { initialUrl: '/profile/documents' });
    await fireEvent.press(
      await screen.findByRole('button', { name: /Comprobante de ingresos/ }, { timeout: 5000 }),
    );
    await waitFor(() => expect(screen).toHavePathname('/profile/documents/proof-of-income'));
    await fireEvent.press(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByTestId('monthly-income')).toBeTruthy();

    await act(() => router.back());
    expect(await screen.findByTestId('income-kind-hrLetter')).toBeTruthy();
    expect(screen).toHavePathname('/profile/documents/proof-of-income');

    await act(() => router.back());
    await waitFor(() => expect(screen).toHavePathname('/profile/documents'));
  });

  it('el perfil abre "Invita a un amigo"', async () => {
    await storeSession();
    await renderRouter(APP_DIR, { initialUrl: '/profile' });
    await fireEvent.press(await screen.findByTestId('profile-referral'));
    await waitFor(() => expect(screen).toHavePathname('/profile/referral'));
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
      process.env.EXPO_PUBLIC_CIRCLES_API = 'http';
      process.env.EXPO_PUBLIC_PROFILE_API = 'http';
      process.env.EXPO_PUBLIC_PAYOUTS_API = 'http';
      process.env.EXPO_PUBLIC_DOCUMENTS_API = 'http';
    });
    afterEach(() => {
      process.env.EXPO_PUBLIC_APP_ENV = original.EXPO_PUBLIC_APP_ENV;
      process.env.EXPO_PUBLIC_AUTH_API = original.EXPO_PUBLIC_AUTH_API;
      process.env.EXPO_PUBLIC_CIRCLES_API = original.EXPO_PUBLIC_CIRCLES_API;
      process.env.EXPO_PUBLIC_PROFILE_API = original.EXPO_PUBLIC_PROFILE_API;
      process.env.EXPO_PUBLIC_PAYOUTS_API = original.EXPO_PUBLIC_PAYOUTS_API;
      process.env.EXPO_PUBLIC_DOCUMENTS_API = original.EXPO_PUBLIC_DOCUMENTS_API;
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
