import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';
import { LockScreen } from '@/presentation/auth/screens/LockScreen';
import { InMemoryPasscodeRepository } from '@/infrastructure/auth/InMemoryPasscodeRepository';
import { useSession } from '@/presentation/providers/SessionProvider';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { FakeBiometricAuth, InMemoryBiometricPreference } from '@test/fakes/ports';
import { renderWithProviders } from '@test/renderWithProviders';

import { PasscodeScreen } from './screens/PasscodeScreen';

const repository = (value?: string) => new InMemoryPasscodeRepository({ latencyMs: 0, value });

async function fill(testID: string, text: string) {
  await fireEvent.changeText(await screen.findByTestId(testID), text);
}

describe('PasscodeScreen (COPAYNI-23)', () => {
  it('sin passcode lo crea pidiendo solo el nuevo dos veces', async () => {
    const passcodes = repository();
    const onDone = jest.fn();
    await renderWithProviders(
      <PasscodeScreen onDone={onDone} />,
      createTestContainer({ passcodes }),
    );
    await fill('passcode-new', '123456');
    expect(screen.queryByTestId('passcode-current')).toBeNull();
    await fill('passcode-confirm', '123456');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(passcodes.value).toBe('123456');
  });

  it('para cambiarlo exige el actual y avisa los intentos que quedan', async () => {
    const passcodes = repository('111111');
    await renderWithProviders(
      <PasscodeScreen onDone={jest.fn()} />,
      createTestContainer({ passcodes }),
    );
    await fill('passcode-current', '000000');
    await fill('passcode-new', '123456');
    await fill('passcode-confirm', '123456');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Passcode incorrecto. Te quedan 4 intentos.',
    );
    expect(passcodes.value).toBe('111111');
  });

  it.each([
    ['123', '123', 'El passcode debe tener 6 dígitos.'],
    ['123456', '654321', 'Los passcodes no coinciden.'],
  ])('valida antes de enviar: %s / %s', async (next, confirmation, message) => {
    const passcodes = repository();
    await renderWithProviders(
      <PasscodeScreen onDone={jest.fn()} />,
      createTestContainer({ passcodes }),
    );
    await fill('passcode-new', next);
    await fill('passcode-confirm', confirmation);
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(passcodes.value).toBeNull();
  });
});

describe('Passcode en la pantalla de bloqueo', () => {
  function Gate() {
    const { status } = useSession();
    return (
      <>
        <Text testID="status">{status}</Text>
        {status === 'locked' && <LockScreen />}
      </>
    );
  }

  function lockedSetup(passcodes: InMemoryPasscodeRepository) {
    const setup = createTestContainer({
      passcodes,
      biometrics: new FakeBiometricAuth('not_enrolled'),
      biometricPreference: new InMemoryBiometricPreference(true),
    });
    setup.adapters.tokenStorage.tokens = AuthTokens.create({ accessToken: 'a', refreshToken: 'r' });
    return setup;
  }

  it('desbloquea con el passcode correcto', async () => {
    await renderWithProviders(<Gate />, lockedSetup(repository('123456')));
    await fill('lock-passcode', '123456');
    await fireEvent.press(screen.getByRole('button', { name: 'Desbloquear con passcode' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
  });

  it('un passcode incorrecto no desbloquea', async () => {
    await renderWithProviders(<Gate />, lockedSetup(repository('123456')));
    await fill('lock-passcode', '000000');
    await fireEvent.press(screen.getByRole('button', { name: 'Desbloquear con passcode' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Passcode incorrecto/);
    expect(screen.getByTestId('status')).toHaveTextContent('locked');
  });

  it('sin passcode solo ofrece ingresar con un código', async () => {
    await renderWithProviders(<Gate />, lockedSetup(repository()));
    expect(await screen.findByRole('button', { name: 'Ingresar con código' })).toBeOnTheScreen();
    expect(screen.queryByTestId('lock-passcode')).toBeNull();
  });
});
