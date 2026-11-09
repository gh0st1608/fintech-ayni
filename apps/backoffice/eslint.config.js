import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Límites de la arquitectura hexagonal (base técnica §3): las capas internas no importan las externas. */
const layer = (files, forbidden, message) => ({
  files,
  rules: {
    'no-restricted-imports': [
      'error',
      { patterns: forbidden.map((group) => ({ group: [group], message })) },
    ],
  },
});

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', '.lintstagedrc.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
    },
  },
  layer(
    ['src/domain/**'],
    [
      'react',
      'react-*',
      '@tanstack/*',
      '@/application/*',
      '@/infrastructure/*',
      '@/presentation/*',
      '@/bootstrap/*',
    ],
    'Domain no depende de React, de la aplicación ni de adaptadores.',
  ),
  layer(
    ['src/application/**'],
    ['react', 'react-*', '@tanstack/*', '@/infrastructure/*', '@/presentation/*', '@/bootstrap/*'],
    'Application solo depende del dominio.',
  ),
  layer(
    ['src/infrastructure/**'],
    ['react', 'react-*', '@/presentation/*', '@/bootstrap/*'],
    'Infrastructure implementa puertos; no conoce la UI.',
  ),
  layer(
    ['src/presentation/**'],
    ['@/infrastructure/*'],
    'Presentation usa casos de uso del contenedor, no adaptadores concretos.',
  ),
  {
    files: ['**/*.config.{js,ts}', 'test/**', '**/*.test.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['eslint.config.js', 'jest.config.js', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
