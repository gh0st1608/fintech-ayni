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

/** Regla de dependencia hexagonal: cada capa declara lo que no puede importar. */
function layerBoundary(files, forbidden, message) {
  return {
    files,
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
    ['src/presentation/**', 'src/app/**'],
    [
      '@/infrastructure/*',
      'expo-secure-store',
      '@react-native-async-storage/*',
      'expo-localization',
    ],
    'La UI usa casos de uso del contenedor; no accede a adaptadores ni APIs del dispositivo.',
  ),
  layerBoundary(
    ['src/presentation/**'],
    [
      '@/infrastructure/*',
      '@/bootstrap/*',
      'expo-secure-store',
      '@react-native-async-storage/*',
      'expo-localization',
    ],
    'Presentation recibe dependencias por ContainerProvider; solo src/app compone el bootstrap.',
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
