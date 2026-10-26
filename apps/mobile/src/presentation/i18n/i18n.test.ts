import { AppError } from '@/domain/shared/errors/AppError';

import { createI18n } from './createI18n';
import { errorMessageKey } from './errorMessageKey';
import { LANGUAGE_CATALOG, SUPPORTED_LANGUAGES } from './languages';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string'
      ? { ...acc, [path]: value }
      : { ...acc, ...flatten(value, path) };
  }, {});
}

const placeholders = (text: string) =>
  (text.match(/{{\s*\w+\s*}}/g) ?? []).map((p) => p.replace(/\s/g, '')).sort();

const reference = flatten(LANGUAGE_CATALOG.find(({ code }) => code === 'es')!.resources);

describe('archivos JSON de idioma', () => {
  it('el catálogo y los idiomas soportados coinciden', () => {
    expect(SUPPORTED_LANGUAGES.map(({ code }) => code)).toEqual(
      LANGUAGE_CATALOG.map(({ code }) => code),
    );
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(2);
  });

  describe.each(LANGUAGE_CATALOG.map((entry) => [entry.code, entry] as const))(
    '%s.json',
    (_code, entry) => {
      const translations = flatten(entry.resources as Tree);

      it('tiene exactamente las mismas claves que es.json', () => {
        expect(Object.keys(translations).sort()).toEqual(Object.keys(reference).sort());
      });

      it('no tiene textos vacíos', () => {
        expect(Object.entries(translations).filter(([, value]) => !value.trim())).toEqual([]);
      });

      it('usa las mismas variables de interpolación que es.json', () => {
        for (const [key, value] of Object.entries(translations)) {
          expect([key, placeholders(value)]).toEqual([key, placeholders(reference[key] ?? '')]);
        }
      });

      it('no contiene monedas: se formatean en runtime', () => {
        const withCurrency = Object.entries(translations).filter(([, value]) =>
          /\b(MAD|PEN|USD)\b|S\/|\$/.test(value),
        );
        expect(withCurrency).toEqual([]);
      });
    },
  );
});

describe('createI18n', () => {
  it('traduce e interpola en el idioma pedido', async () => {
    const i18n = await createI18n('es', 'es');
    expect(i18n.t('welcome.title', { appName: 'Ayni' })).toBe('Bienvenido a Ayni');
    await i18n.changeLanguage('en');
    expect(i18n.t('profile.logout')).toBe('Log out');
  });

  it('cada llamada crea una instancia aislada', async () => {
    const [a, b] = await Promise.all([createI18n('es', 'es'), createI18n('en', 'es')]);
    expect(a.language).toBe('es');
    expect(b.language).toBe('en');
  });

  it('soporta plurales con count', async () => {
    const i18n = await createI18n('es', 'es');
    i18n.addResources('es', 'translation', {
      items_one: '{{count}} círculo',
      items_other: '{{count}} círculos',
    });
    const t = i18n.t as unknown as (key: string, options: { count: number }) => string;
    expect(t('items', { count: 1 })).toBe('1 círculo');
    expect(t('items', { count: 3 })).toBe('3 círculos');
  });
});

describe('errorMessageKey', () => {
  it('mapea el tipo de error a su clave i18n existente', async () => {
    const i18n = await createI18n('es', 'es');
    expect(errorMessageKey(new AppError('timeout', 'x'))).toBe('errors.timeout');
    expect(errorMessageKey(new Error('x'))).toBe('errors.unknown');
    expect(i18n.t(errorMessageKey(new AppError('network', 'x')))).toMatch(/conexión/);
  });
});
