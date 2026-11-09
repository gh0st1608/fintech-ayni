import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AppState, Pressable, Text } from 'react-native';

import { RELOCK_AFTER_MS } from '@/application/auth/usecases/biometricUseCases';
import { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';
import { ProfileScreen } from '@/presentation/profile/screens/ProfileScreen';
import { useSession } from '@/presentation/providers/SessionProvider';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { FakeBiometricAuth, InMemoryBiometricPreference } from '@test/fakes/ports';
import { renderWithProviders } from '@test/renderWithProviders';

import { LockScreen } from './screens/LockScreen';

function Status() {
  return <Text testID="status">{useSession().status}</Text>;
}

/** Como la guarda de rutas: la pantalla solo existe con la sesión bloqueada. */
function LockedGate() {
  const { status } = useSession();
  return (
    <>
      <Status />
      {status === 'locked' && <LockScreen />}
    </>
  );
}

function lockedSetup(biometrics: FakeBiometricAuth) {
  const setup = createTestContainer({
    biometrics,
    biometricPreference: new InMemoryBiometricPreference(true),
  });
  setup.adapters.tokenStorage.tokens = AuthTokens.create({ accessToken: 'a', refreshToken: 'r' });
  return setup;
}

const renderLock = (setup: ReturnType<typeof createTestContainer>) =>
  renderWithProviders(<LockedGate />, setup);

describe('LockScreen (COPAYNI-22)', () => {
  it('pide la biometría al abrirse y desbloquea la sesión', async () => {
    const biometrics = new FakeBiometricAuth('available', ['success']);
    await renderLock(lockedSetup(biometrics));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(biometrics.prompts).toBeGreaterThan(0);
  });

  it('tras fallos repetidos ofrece ingresar con un código, que cierra la sesión', async () => {
    const setup = lockedSetup(new FakeBiometricAuth('available', ['failed']));
    await renderLock(setup);
    await screen.findByRole('alert');

    await fireEvent.press(screen.getByRole('button', { name: 'Desbloquear' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desbloquear' })).toBeEnabled());
    await fireEvent.press(screen.getByRole('button', { name: 'Desbloquear' }));

    await fireEvent.press(await screen.findByRole('button', { name: 'Ingresar con código' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(setup.adapters.tokenStorage.tokens).toBeNull();
    expect(setup.adapters.biometricPreference.enabled).toBe(false);
  });

  it('si el dispositivo perdió la biometría va directo al método alternativo', async () => {
    await renderLock(lockedSetup(new FakeBiometricAuth('not_enrolled')));
    expect(await screen.findByRole('button', { name: 'Ingresar con código' })).toBeOnTheScreen();
  });

  it('con el passcode verificándose no se puede salir con código', async () => {
    const setup = lockedSetup(new FakeBiometricAuth('not_enrolled'));
    setup.adapters.passcodes.value = '123456';
    jest.spyOn(setup.adapters.passcodes, 'verify').mockReturnValue(new Promise(() => undefined));
    await renderLock(setup);

    await fireEvent.changeText(await screen.findByTestId('lock-passcode'), '123456');
    await fireEvent.press(screen.getByRole('button', { name: 'Desbloquear con passcode' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ingresar con código' })).toBeDisabled(),
    );
    expect(screen.getByTestId('status')).toHaveTextContent('locked');
  });

  it('cancelar no cuenta como fallo', async () => {
    await renderLock(lockedSetup(new FakeBiometricAuth('available', ['cancelled'])));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desbloquear' })).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('desbloquear', () => {
  /** Expone las transiciones de la sesión como botones. */
  function SessionControls() {
    const { unlock, signOut } = useSession();
    return (
      <>
        <Status />
        <Pressable accessibilityRole="button" onPress={() => void signOut()}>
          <Text>salir</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={unlock}>
          <Text>desbloquear</Text>
        </Pressable>
      </>
    );
  }

  it('una verificación que llega después de cerrar la sesión no la reabre', async () => {
    await renderWithProviders(<SessionControls />, lockedSetup(new FakeBiometricAuth()));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('locked'));

    await fireEvent.press(screen.getByRole('button', { name: 'salir' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    await fireEvent.press(screen.getByRole('button', { name: 'desbloquear' }));
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
  });
});

describe('sesión bloqueada', () => {
  function captureAppState() {
    let listener: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      listener = handler as (state: string) => void;
      return { remove: jest.fn() } as never;
    });
    return (state: string) => listener?.(state);
  }

  afterEach(() => jest.restoreAllMocks());

  it('con biometría activa, una sesión guardada arranca bloqueada', async () => {
    await renderWithProviders(<Status />, lockedSetup(new FakeBiometricAuth()));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('locked'));
  });

  it.each([
    ['se bloquea', RELOCK_AFTER_MS, 'locked'],
    ['sigue abierta', RELOCK_AFTER_MS - 1000, 'authenticated'],
  ])('al volver de segundo plano %s según el tiempo', async (_title, elapsed, expected) => {
    const emit = captureAppState();
    const setup = createTestContainer();
    setup.adapters.tokenStorage.tokens = AuthTokens.create({ accessToken: 'a', refreshToken: 'r' });
    await renderWithProviders(<Status />, setup);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    setup.adapters.biometricPreference.enabled = true;
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);

    await act(async () => emit('background'));
    now.mockReturnValue(1_000 + elapsed);
    await act(async () => emit('active'));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent(expected));
  });

  it('si no puede leer la preferencia al volver de segundo plano, se bloquea', async () => {
    const emit = captureAppState();
    const setup = createTestContainer();
    setup.adapters.tokenStorage.tokens = AuthTokens.create({ accessToken: 'a', refreshToken: 'r' });
    await renderWithProviders(<Status />, setup);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    jest
      .spyOn(setup.adapters.biometricPreference, 'isEnabled')
      .mockRejectedValue(new Error('storage'));
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);

    await act(async () => emit('background'));
    now.mockReturnValue(1_000 + RELOCK_AFTER_MS);
    await act(async () => emit('active'));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('locked'));
  });
});

describe('Enable Biometrics en el Perfil', () => {
  it('queda activada solo al confirmar con el sensor', async () => {
    const setup = createTestContainer();
    await renderWithProviders(<ProfileScreen />, setup);
    await fireEvent(await screen.findByTestId('biometric-toggle'), 'valueChange', true);
    await waitFor(() => expect(setup.adapters.biometricPreference.enabled).toBe(true));
    await waitFor(() => expect(screen.getByTestId('biometric-toggle')).toBeChecked());
  });

  it('un fallo del sensor no la activa y lo avisa', async () => {
    const setup = createTestContainer({
      biometrics: new FakeBiometricAuth('available', ['failed']),
    });
    await renderWithProviders(<ProfileScreen />, setup);
    await fireEvent(await screen.findByTestId('biometric-toggle'), 'valueChange', true);
    expect(
      await screen.findByText('No pudimos verificarte. Inténtalo de nuevo.'),
    ).toBeOnTheScreen();
    expect(setup.adapters.biometricPreference.enabled).toBe(false);
  });

  it('si se borraron las huellas con la biometría activa, se puede apagar', async () => {
    const setup = createTestContainer({
      biometrics: new FakeBiometricAuth('not_enrolled'),
      biometricPreference: new InMemoryBiometricPreference(true),
    });
    await renderWithProviders(<ProfileScreen />, setup);
    const toggle = await screen.findByTestId('biometric-toggle');
    expect(toggle).toBeChecked();
    expect(toggle).toBeEnabled();
    await fireEvent(toggle, 'valueChange', false);
    await waitFor(() => expect(setup.adapters.biometricPreference.enabled).toBe(false));
  });

  it('sin biometría registrada el interruptor está deshabilitado y lo explica', async () => {
    await renderWithProviders(
      <ProfileScreen />,
      createTestContainer({ biometrics: new FakeBiometricAuth('not_enrolled') }),
    );
    expect(await screen.findByTestId('biometric-toggle')).toBeDisabled();
    expect(
      screen.getByText('Registra tu huella o tu rostro en los ajustes del dispositivo.', {
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
  });
});
