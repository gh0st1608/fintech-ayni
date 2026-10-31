import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { AppError } from '@/domain/shared/errors/AppError';
import { InMemoryUserProfileRepository } from '@/infrastructure/profile/InMemoryUserProfileRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { ChangeContactScreen } from './screens/ChangeContactScreen';
import { PersonalInfoScreen } from './screens/PersonalInfoScreen';
import { ProfileScreen } from './screens/ProfileScreen';

const profiles = (profile = {}) =>
  new InMemoryUserProfileRepository({ latencyMs: 0, currency: 'PEN', profile });

describe('ProfileScreen (COPAYNI-44)', () => {
  it('muestra el nombre, el contacto y el límite mensual, que abre los documentos', async () => {
    const onOpenPersonalInfo = jest.fn();
    const onOpenDocuments = jest.fn();
    await renderWithProviders(
      <ProfileScreen onOpenPersonalInfo={onOpenPersonalInfo} onOpenDocuments={onOpenDocuments} />,
      createTestContainer({
        userProfile: profiles({ firstName: 'Ana', lastName: 'Quispe', fullName: 'Ana Quispe' }),
      }),
    );
    expect(await screen.findByTestId('profile-header')).toHaveTextContent(
      /Ana Quispe.*ana@mail\.com/,
    );
    expect(screen.getByTestId('profile-limit')).toHaveTextContent(
      /Límite mensual de pago.*5\.?000/,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Información personal' }));
    expect(onOpenPersonalInfo).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('profile-limit'));
    expect(onOpenDocuments).toHaveBeenCalled();
  });

  it('sin nombre invita a agregarlo; sin límite lo dice', async () => {
    await renderWithProviders(
      <ProfileScreen />,
      createTestContainer({ userProfile: profiles({ monthlyPayInLimit: null }) }),
    );
    expect(await screen.findByText('Agrega tu nombre')).toBeTruthy();
    expect(screen.getByText('Sin límite')).toBeTruthy();
  });

  it('si el perfil no carga, los accesos y el cierre de sesión siguen disponibles', async () => {
    const userProfile = profiles();
    const failing = jest
      .spyOn(userProfile, 'getProfile')
      .mockRejectedValue(new AppError('unknown', 'boom'));
    await renderWithProviders(<ProfileScreen />, createTestContainer({ userProfile }));
    expect(await screen.findByTestId('profile-error')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Idioma. Español' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();

    failing.mockRestore();
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('profile-header')).toBeTruthy();
  });
});

describe('PersonalInfoScreen (COPAYNI-45)', () => {
  it('guarda nombre y apellido; Guardar solo se habilita con cambios', async () => {
    const userProfile = profiles({ firstName: 'Ana', lastName: 'Quispe' });
    await renderWithProviders(
      <PersonalInfoScreen onChangeContact={jest.fn()} />,
      createTestContainer({ userProfile }),
    );
    const save = await screen.findByRole('button', { name: 'Guardar cambios' });
    expect(save).toBeDisabled();

    await fireEvent.changeText(screen.getByTestId('first-name'), 'Rosa');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Cambios guardados.')).toBeTruthy();
    expect(userProfile.profile).toMatchObject({ firstName: 'Rosa', fullName: 'Rosa Quispe' });
  });

  it('marca un nombre inválido sin llamar al backend', async () => {
    const userProfile = profiles({ firstName: 'Ana', lastName: 'Quispe' });
    const update = jest.spyOn(userProfile, 'updatePersonalInfo');
    await renderWithProviders(
      <PersonalInfoScreen onChangeContact={jest.fn()} />,
      createTestContainer({ userProfile }),
    );
    await fireEvent.changeText(await screen.findByTestId('last-name'), '<script>');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText(/sin < ni >/)).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  it('el email y el teléfono se cambian aparte', async () => {
    const onChangeContact = jest.fn();
    await renderWithProviders(
      <PersonalInfoScreen onChangeContact={onChangeContact} />,
      createTestContainer({ userProfile: profiles() }),
    );
    expect(await screen.findByTestId('contact-phone')).toHaveTextContent(/Sin registrar/);
    await fireEvent.press(screen.getByRole('button', { name: /Teléfono/ }));
    expect(onChangeContact).toHaveBeenCalledWith('phone');
  });
});

describe('ChangeContactScreen (COPAYNI-45, R9)', () => {
  it('cambia el email con el código enviado al dato nuevo', async () => {
    const userProfile = profiles();
    const onChanged = jest.fn();
    await renderWithProviders(
      <ChangeContactScreen type="email" onChanged={onChanged} />,
      createTestContainer({ userProfile }),
    );
    await fireEvent.changeText(screen.getByTestId('contact-value'), 'nueva@mail.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar código' }));
    expect(await screen.findByText(/Escribe el código que enviamos a nu\*\*\*om/)).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('contact-otp'), '1234');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(userProfile.profile.email).toBe('nueva@mail.com');
  });

  it('explica un formato inválido, un código incorrecto y un dato de otra cuenta', async () => {
    await renderWithProviders(
      <ChangeContactScreen type="phone" onChanged={jest.fn()} />,
      createTestContainer({ userProfile: profiles() }),
    );
    await fireEvent.changeText(screen.getByTestId('contact-value'), '987654321');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar código' }));
    expect(await screen.findByText(/con el código de país/)).toBeTruthy();
  });

  it('un dato ya registrado en otra cuenta no se aplica', async () => {
    const onChanged = jest.fn();
    await renderWithProviders(
      <ChangeContactScreen type="email" onChanged={onChanged} />,
      createTestContainer({ userProfile: profiles() }),
    );
    await fireEvent.changeText(screen.getByTestId('contact-value'), 'usado@mail.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar código' }));
    await fireEvent.changeText(await screen.findByTestId('contact-otp'), '0000');
    expect(await screen.findByText('El código no es correcto.')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('contact-otp'), '1234');
    await fireEvent.press(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText(/ya está registrado en otra cuenta/)).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
