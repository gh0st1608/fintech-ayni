import { fireEvent, screen } from '@testing-library/react-native';

import type { TextDirection } from '@/domain/i18n/Language';
import { FakeLayoutDirection } from '@test/fakes/ports';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { ProfileScreen } from './screens/ProfileScreen';

// Idioma RTL de prueba: el catálogo real todavía no tiene ninguno (pending-scope M3).
jest.mock('@/presentation/i18n/languages', () => {
  const actual = jest.requireActual('@/presentation/i18n/languages');
  const catalog = [
    ...actual.LANGUAGE_CATALOG,
    { ...actual.LANGUAGE_CATALOG[1], code: 'ar', nativeName: 'العربية', direction: 'rtl' },
  ];
  return {
    LANGUAGE_CATALOG: catalog,
    SUPPORTED_LANGUAGES: catalog.map(
      ({ code, direction }: { code: string; direction: TextDirection }) => ({ code, direction }),
    ),
  };
});

it('un JSON nuevo aparece en la lista y el cambio a RTL avisa del reinicio', async () => {
  const layoutDirection = new FakeLayoutDirection('ltr');
  await renderWithProviders(<ProfileScreen />, createTestContainer({ layoutDirection }));
  await fireEvent.press(screen.getByRole('button', { name: 'Idioma. Español' }));

  await fireEvent.press(screen.getByRole('radio', { name: 'العربية' }));
  expect(screen.getByText(/cuando la reinicies/)).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByRole('button', { name: 'Language. العربية' })).toBeTruthy();
  expect(layoutDirection.applied).toEqual(['rtl']);
});
