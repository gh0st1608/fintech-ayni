import { createContainer } from '@/bootstrap/container';
import { parseEnv } from '@/bootstrap/env';

import {
  FakeDeviceLocale,
  FakeLayoutDirection,
  InMemoryLanguagePreference,
  InMemoryTokenStorage,
} from './ports';

interface TestAdapters {
  tokenStorage: InMemoryTokenStorage;
  languagePreference: InMemoryLanguagePreference;
  deviceLocale: FakeDeviceLocale;
  layoutDirection: FakeLayoutDirection;
}

/** Contenedor real con adaptadores en memoria: casos de uso reales, sin dispositivo ni red. */
export function createTestContainer(overrides: Partial<TestAdapters> = {}) {
  const adapters: TestAdapters = {
    tokenStorage: new InMemoryTokenStorage(),
    languagePreference: new InMemoryLanguagePreference(),
    deviceLocale: new FakeDeviceLocale(),
    layoutDirection: new FakeLayoutDirection(),
    ...overrides,
  };
  const env = parseEnv({ apiUrl: 'https://api.test.local/v1' });
  return { container: createContainer(env, adapters), adapters, env };
}
