// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');
const i18next = require('eslint-plugin-i18next');

// Códigos y símbolos de moneda que nunca deben aparecer en el código:
// la moneda llega del backend o de la configuración (COPAYNI-17).
const CURRENCY_LITERAL = String.raw`^(MAD|PEN|USD|EUR|S\/\.?|\$)$|\b(MAD|PEN|USD)\b|S\/`;

const FRAMEWORKS = [
  'react',
  'react-native',
  'react-native-*',
  'react-i18next',
  'expo',
  'expo-*',
  '@expo/*',
  '@react-native-async-storage/*',
  '@tanstack/*',
  'i18next',
];

const DEVICE_APIS = ['expo-secure-store', '@react-native-async-storage/*', 'expo-localization'];

/** Regla de dependencia hexagonal: cada capa declara lo que no puede importar. */
function layerBoundary(files, forbidden, message, ignores = []) {
  return {
    files,
    ignores,
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: forbidden, message }] }],
    },
  };
}

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { i18next },
    rules: {
      // Ningún texto visible hardcodeado: todo sale de los JSON de idioma (COPAYNI-16).
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          'jsx-attributes': {
            include: ['title', 'label', 'placeholder', 'accessibilityLabel', 'accessibilityHint'],
          },
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=/${CURRENCY_LITERAL}/]`,
          message: 'No hardcodear monedas: usar Money + formatMoney (COPAYNI-17).',
        },
        {
          selector: `TemplateElement[value.raw=/${CURRENCY_LITERAL}/]`,
          message: 'No hardcodear monedas: usar Money + formatMoney (COPAYNI-17).',
        },
      ],
    },
  },
  layerBoundary(
    ['src/domain/**'],
    [
      '@/application/*',
      '@/infrastructure/*',
      '@/presentation/*',
      '@/bootstrap/*',
      'zod',
      ...FRAMEWORKS,
    ],
    'Domain no depende de otras capas, frameworks, almacenamiento ni red.',
  ),
  layerBoundary(
    ['src/application/**'],
    ['@/infrastructure/*', '@/presentation/*', '@/bootstrap/*', ...FRAMEWORKS],
    'Application solo depende de Domain: usa puertos, no implementaciones ni frameworks.',
  ),
  layerBoundary(
    ['src/infrastructure/**'],
    ['@/application/*', '@/presentation/*', '@/bootstrap/*'],
    'Infrastructure implementa puertos de Domain; no conoce casos de uso ni UI.',
  ),
  layerBoundary(
    ['src/presentation/**'],
    ['@/infrastructure/*', '@/bootstrap/*', ...DEVICE_APIS],
    'Presentation recibe dependencias por ContainerProvider; solo src/app compone el bootstrap.',
  ),
  // src/app es el adaptador de navegación (Expo Router): cada archivo es una ruta.
  layerBoundary(
    ['src/app/**'],
    [
      '@/infrastructure/*',
      '@/bootstrap/*',
      '@/domain/*',
      '@/application/*',
      '@/presentation/shared/*',
      '@/presentation/theme/*',
      '@/presentation/i18n/*',
      '@/presentation/navigation/*',
      'react-native',
      'react-native-*',
      'react-i18next',
      '@expo/*',
      ...DEVICE_APIS,
    ],
    'Las rutas solo re-exportan pantallas de presentation/<módulo>/screens (o usan router y sesión).',
    ['src/app/**/_layout.tsx'],
  ),
  layerBoundary(
    ['src/app/**/_layout.tsx'],
    [
      '@/infrastructure/*',
      '@/domain/*',
      '@/application/*',
      '@/presentation/shared/*',
      '@/presentation/theme/*',
      'react-native',
      'react-native-*',
      'react-i18next',
      '@expo/*',
      ...DEVICE_APIS,
    ],
    'Los layouts componen navegadores y providers; la UI y su configuración viven en presentation.',
  ),
  {
    // La configuración es el único lugar donde se define la moneda por defecto.
    files: ['src/bootstrap/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['src/**/*.test.{ts,tsx}', 'test/**/*'],
    rules: {
      'i18next/no-literal-string': 'off',
      'no-restricted-syntax': 'off',
      'no-restricted-imports': 'off',
    },
  },
  {
    ignores: ['dist/*', 'coverage/*', '.expo/*'],
  },
]);
