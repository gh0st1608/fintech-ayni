// @ts-check
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Frameworks, transporte, persistencia y nube: nada de esto entra al dominio. */
const FRAMEWORKS = [
  '@nestjs/*',
  'express',
  'class-validator',
  'class-transformer',
  'rxjs',
  'helmet',
  '@aws-sdk/*',
  'aws-sdk',
  'typeorm',
  '@prisma/*',
  'mongoose',
  'pg',
];

/** Regla de dependencia hexagonal: cada capa declara lo que no puede importar. */
function layerBoundary(files, forbidden, message) {
  return {
    files,
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: [...forbidden, '@src/*', '@test/*'], message }] },
      ],
    },
  };
}

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      // Los controllers y providers de NestJS son clases vacías decoradas.
      '@typescript-eslint/no-extraneous-class': 'off',
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      // Los alias de pruebas no existen en el build de producción.
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@src/*', '@test/*'], message: 'Usar imports relativos en src.' }] },
      ],
      // La configuración se lee solo a través de ConfigService (src/config).
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'env', message: 'Leer la configuración con ConfigService.' },
      ],
    },
  },
  {
    files: ['src/config/**/*.ts', 'src/main.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  layerBoundary(
    ['src/modules/*/domain/**/*.ts', 'src/shared/domain/**/*.ts'],
    [
      '**/application/**',
      '**/infrastructure/**',
      '**/presentation/**',
      '**/config/**',
      ...FRAMEWORKS,
    ],
    'Domain no depende de otras capas, de NestJS, del ORM ni de AWS.',
  ),
  layerBoundary(
    ['src/modules/*/application/**/*.ts', 'src/shared/application/**/*.ts'],
    ['**/infrastructure/**', '**/presentation/**', 'express', '@aws-sdk/*', 'typeorm', '@prisma/*'],
    'Application depende de puertos, no de adaptadores ni de HTTP.',
  ),
  layerBoundary(
    ['src/modules/*/infrastructure/**/*.ts', 'src/shared/infrastructure/**/*.ts'],
    ['**/presentation/**'],
    'Infrastructure no depende de la capa de presentación.',
  ),
  {
    files: ['test/**/*.ts'],
    rules: {
      // supertest y jest devuelven any en sus aserciones.
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    files: ['eslint.config.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
