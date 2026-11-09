/**
 * Jest no entiende Vite: SWC transpila TypeScript y JSX, y `import.meta.env` queda aislado en
 * `src/bootstrap/viteEnv.ts`, que aquí se reemplaza por un doble de prueba.
 */
/** @type {import('jest').Config} */
const config = {
  testEnvironment: '<rootDir>/test/jsdom-environment.cjs',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          transform: { react: { runtime: 'automatic' } },
          target: 'es2022',
        },
        module: { type: 'commonjs' },
      },
    ],
  },
  moduleNameMapper: {
    '^@/bootstrap/viteEnv$': '<rootDir>/test/viteEnv.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
    '\\.css$': 'identity-obj-proxy',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/main.tsx',
    '!src/bootstrap/viteEnv.ts',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: { statements: 90, branches: 85, functions: 90, lines: 90 },
  },
};

export default config;
