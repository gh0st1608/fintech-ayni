import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { FakeLayoutDirection, InMemoryLanguagePreference } from '@test/fakes/ports';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { ProfileScreen } from './screens/ProfileScreen';

async function openLanguageSheet(setup = createTestContainer()) {
  const view = await renderWithProviders(<ProfileScreen />, setup);
  await fireEvent.press(screen.getByRole('button', { name: 'Idioma. Español' }));
  return view;
}

describe('LanguageSheet', () => {
  it('lista los idiomas registrados en su propio idioma, con el actual seleccionado', async () => {
    await openLanguageSheet();
    expect(screen.getByRole('header', { name: 'Cambiar idioma' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Español' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'English' })).not.toBeChecked();
  });

  it('Guardar está deshabilitado mientras no cambie la selección', async () => {
    await openLanguageSheet();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: 'English' }));
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled();
    await fireEvent.press(screen.getByRole('radio', { name: 'Español' }));
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('al guardar cambia la UI en caliente, persiste y sincroniza con el perfil', async () => {
    const layoutDirection = new FakeLayoutDirection('ltr');
    const { adapters } = await openLanguageSheet(createTestContainer({ layoutDirection }));
    expect(screen.queryByText(/reinicies/)).toBeNull();

    await fireEvent.press(screen.getByRole('radio', { name: 'English' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('button', { name: 'Language. English' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy();
    expect(adapters.languagePreference.stored).toBe('en');
    expect(layoutDirection.applied).toEqual([]);
    await waitFor(() => expect(adapters.userProfile.preferredLanguage).toBe('en'));
    expect(adapters.languageSyncState.stored).toBeNull();
  });

  it('si la sincronización falla, el cambio local se mantiene y queda pendiente', async () => {
    const setup = createTestContainer();
    setup.adapters.userProfile.updatePreferredLanguage = jest
      .fn()
      .mockRejectedValue(new Error('offline'));
    await openLanguageSheet(setup);

    await fireEvent.press(screen.getByRole('radio', { name: 'English' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('button', { name: 'Language. English' })).toBeTruthy();
    await waitFor(() => expect(setup.adapters.languageSyncState.stored).toBe('en'));
  });

  it('si no puede guardar la preferencia, avisa y no cierra', async () => {
    const languagePreference = new InMemoryLanguagePreference();
    languagePreference.save = jest.fn().mockRejectedValue(new Error('io'));
    await openLanguageSheet(createTestContainer({ languagePreference }));

    await fireEvent.press(screen.getByRole('radio', { name: 'English' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error inesperado.');
    expect(screen.getByRole('header', { name: 'Cambiar idioma' })).toBeTruthy();
  });

  it('cerrar descarta la selección', async () => {
    await openLanguageSheet();
    await fireEvent.press(screen.getByRole('radio', { name: 'English' }));
    await fireEvent.press(screen.getAllByRole('button', { name: 'Cerrar' })[0]!);
    await fireEvent.press(screen.getByRole('button', { name: 'Idioma. Español' }));
    expect(screen.getByRole('radio', { name: 'Español' })).toBeChecked();
  });
});
