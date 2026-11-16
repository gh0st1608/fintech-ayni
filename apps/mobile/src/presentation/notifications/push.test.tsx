import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useCallback } from 'react';
import { Pressable, Text } from 'react-native';

import {
  FakePushNotifier,
  InMemoryPushRepository,
} from '@/infrastructure/notifications/InMemoryPushRepository';
import { useSession } from '@/presentation/providers/SessionProvider';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { NotificationSettingsScreen } from './screens/NotificationSettingsScreen';
import { usePushRegistration } from './usePushRegistration';

/** Avisos en el celular (COPAYNI-85): ajustes, registro del dispositivo y toque en el aviso. */
function setup(notifier = new FakePushNotifier(), push = new InMemoryPushRepository()) {
  return { ...createTestContainer({ push, pushNotifier: notifier }), push, notifier };
}

describe('ajustes de los avisos', () => {
  it('muestra las preferencias y deja apagar una categoría', async () => {
    const test = setup();
    await renderWithProviders(<NotificationSettingsScreen />, test);

    const payments = await screen.findByTestId('push-category-payments');
    expect(payments.props.accessibilityState.checked).toBe(true);

    fireEvent(payments, 'valueChange', false);
    await waitFor(() => {
      expect(test.push.preferencesState.categories.payments).toBe(false);
    });
    // Las demás no se tocan.
    expect(test.push.preferencesState.categories.circles).toBe(true);
  });

  it('con el interruptor general apagado, las categorías quedan sin efecto', async () => {
    const push = new InMemoryPushRepository();
    push.preferencesState = {
      pushEnabled: false,
      categories: { payments: true, circles: true, account: true },
    };
    await renderWithProviders(<NotificationSettingsScreen />, setup(new FakePushNotifier(), push));

    const payments = await screen.findByTestId('push-category-payments');
    expect(payments.props.accessibilityState.disabled).toBe(true);
  });

  it('si el teléfono tiene los avisos bloqueados, lo explica y no ofrece interruptores útiles', async () => {
    const notifier = new FakePushNotifier({ permission: 'denied' });
    await renderWithProviders(<NotificationSettingsScreen />, setup(notifier));

    expect(await screen.findByTestId('push-permission-denied')).toBeTruthy();
    expect(screen.getByTestId('push-open-settings')).toBeTruthy();
    expect(screen.getByTestId('push-enabled').props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByTestId('push-enable')).toBeNull();
  });

  it('sin permiso todavía, ofrece activarlo y registra el celular al aceptar', async () => {
    const notifier = new FakePushNotifier({ permission: 'undetermined' });
    const test = setup(notifier);
    await renderWithProviders(<NotificationSettingsScreen />, test);

    fireEvent.press(await screen.findByTestId('push-enable'));
    await waitFor(() => expect(test.push.devices.size).toBe(1));
    expect(notifier.asked).toBe(1);
    // El canal de Android se prepara antes de pedir el token.
    expect(notifier.prepared).toBe(1);
  });

  it('si el permiso se rechaza, no registra nada', async () => {
    const notifier = new FakePushNotifier({ permission: 'undetermined', onRequest: 'denied' });
    const test = setup(notifier);
    await renderWithProviders(<NotificationSettingsScreen />, test);

    fireEvent.press(await screen.findByTestId('push-enable'));
    await waitFor(() => expect(notifier.asked).toBe(1));
    expect(test.push.devices.size).toBe(0);
  });

  it('si no se pueden leer las preferencias, lo dice y deja reintentar', async () => {
    const push = new InMemoryPushRepository();
    const failing = jest
      .spyOn(push, 'preferences')
      .mockRejectedValueOnce(new Error('sin conexión'));
    await renderWithProviders(<NotificationSettingsScreen />, setup(new FakePushNotifier(), push));

    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('push-enabled')).toBeTruthy();
    failing.mockRestore();
  });
});

/** La pantalla que monta el layout privado: registra el celular y escucha los toques. */
function Harness({ onOpen }: { onOpen: () => void }) {
  usePushRegistration(useCallback(() => onOpen(), [onOpen]));
  const { signOut } = useSession();
  return (
    <Pressable accessibilityRole="button" onPress={() => void signOut()}>
      <Text>Cerrar sesión</Text>
    </Pressable>
  );
}

describe('registro del celular', () => {
  it('al entrar registra el dispositivo si ya había permiso', async () => {
    const test = setup();
    await renderWithProviders(<Harness onOpen={jest.fn()} />, test);
    await waitFor(() => expect(test.push.devices.size).toBe(1));
  });

  it('al entrar no pregunta por el permiso: eso se pide en los ajustes', async () => {
    const notifier = new FakePushNotifier({ permission: 'undetermined' });
    const test = setup(notifier);
    await renderWithProviders(<Harness onOpen={jest.fn()} />, test);

    await waitFor(() => expect(notifier.asked).toBe(0));
    expect(test.push.devices.size).toBe(0);
  });

  it('en un emulador no intenta registrar nada', async () => {
    const notifier = new FakePushNotifier({ supported: false });
    const test = setup(notifier);
    await renderWithProviders(<Harness onOpen={jest.fn()} />, test);

    await waitFor(() => expect(notifier.prepared).toBe(0));
    expect(test.push.devices.size).toBe(0);
  });

  it('sin token del proveedor no registra el dispositivo', async () => {
    const notifier = new FakePushNotifier({ token: null });
    const test = setup(notifier);
    await renderWithProviders(<Harness onOpen={jest.fn()} />, test);

    await waitFor(() => expect(notifier.prepared).toBe(1));
    expect(test.push.devices.size).toBe(0);
  });

  it('al tocar un aviso abre la bandeja', async () => {
    const notifier = new FakePushNotifier();
    const onOpen = jest.fn();
    await renderWithProviders(<Harness onOpen={onOpen} />, setup(notifier));

    notifier.tap();
    await waitFor(() => expect(onOpen).toHaveBeenCalled());
  });

  it('al cerrar sesión este celular deja de recibir avisos', async () => {
    const test = setup();
    await renderWithProviders(<Harness onOpen={jest.fn()} />, test);
    await waitFor(() => expect(test.push.devices.size).toBe(1));

    fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(test.push.devices.size).toBe(0));
  });
});
