import { UnsupportedLanguageError, type SupportedLanguage } from '@/domain/i18n/Language';

import {
  FakeDeviceLocale,
  FakeLayoutDirection,
  InMemoryLanguagePreference,
} from '@test/fakes/ports';

import { ChangeLanguageUseCase } from './ChangeLanguageUseCase';
import { ResolveLanguageUseCase } from './ResolveLanguageUseCase';

const SUPPORTED: SupportedLanguage[] = [
  { code: 'es', direction: 'ltr' },
  { code: 'en', direction: 'ltr' },
  { code: 'ar', direction: 'rtl' },
];

describe('ResolveLanguageUseCase', () => {
  const resolve = (preferred: string | null, device: string[], fallback = 'es') =>
    new ResolveLanguageUseCase(
      new InMemoryLanguagePreference(preferred),
      new FakeDeviceLocale(device),
      SUPPORTED,
      fallback,
    ).execute();

  it('prioriza la preferencia guardada', async () => {
    await expect(resolve('en', ['es'])).resolves.toBe('en');
  });

  it('ignora preferencias no soportadas y usa el primer idioma del dispositivo soportado', async () => {
    await expect(resolve('qu', ['fr', 'ar', 'es'])).resolves.toBe('ar');
  });

  it('usa el idioma por defecto configurado si el dispositivo no coincide', async () => {
    await expect(resolve(null, ['fr'], 'en')).resolves.toBe('en');
  });

  it('cae al primer idioma soportado si el defecto configurado no existe', async () => {
    await expect(resolve(null, [], 'de')).resolves.toBe('es');
  });

  it('tolera una preferencia ilegible', async () => {
    const preference = new InMemoryLanguagePreference();
    preference.read = jest.fn().mockRejectedValue(new Error('io'));
    const useCase = new ResolveLanguageUseCase(
      preference,
      new FakeDeviceLocale(['en']),
      SUPPORTED,
      'es',
    );
    await expect(useCase.execute()).resolves.toBe('en');
  });

  it('exige al menos un idioma soportado', () => {
    expect(
      () =>
        new ResolveLanguageUseCase(
          new InMemoryLanguagePreference(),
          new FakeDeviceLocale(),
          [],
          'es',
        ),
    ).toThrow(/At least one/);
  });
});

describe('ChangeLanguageUseCase', () => {
  it('persiste el idioma sin reinicio si la dirección no cambia', async () => {
    const preference = new InMemoryLanguagePreference('es');
    const layout = new FakeLayoutDirection('ltr');
    const useCase = new ChangeLanguageUseCase(preference, layout, SUPPORTED);

    await expect(useCase.execute('en')).resolves.toEqual({ requiresRestart: false });
    expect(preference.stored).toBe('en');
    expect(layout.applied).toEqual([]);
  });

  it('aplica RTL e indica reinicio al cambiar a un idioma RTL', async () => {
    const layout = new FakeLayoutDirection('ltr');
    const useCase = new ChangeLanguageUseCase(new InMemoryLanguagePreference(), layout, SUPPORTED);

    await expect(useCase.execute('ar')).resolves.toEqual({ requiresRestart: true });
    expect(layout.applied).toEqual(['rtl']);
  });

  it('rechaza idiomas no soportados sin persistir nada', async () => {
    const preference = new InMemoryLanguagePreference('es');
    const useCase = new ChangeLanguageUseCase(preference, new FakeLayoutDirection(), SUPPORTED);

    await expect(useCase.execute('fr')).rejects.toThrow(UnsupportedLanguageError);
    expect(preference.stored).toBe('es');
  });
});
