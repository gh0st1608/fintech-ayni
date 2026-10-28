import { createContainer } from '@/bootstrap/container';
import { parseEnv } from '@/bootstrap/env';

import { InMemoryAuthApi } from '@/infrastructure/auth/InMemoryAuthApi';
import { InMemoryCircleMembershipRepository } from '@/infrastructure/circles/InMemoryCircleMembershipRepository';
import { InMemoryCircleQuoteRepository } from '@/infrastructure/circles/InMemoryCircleQuoteRepository';
import { InMemoryJoinConfigRepository } from '@/infrastructure/circles/InMemoryJoinConfigRepository';
import { InMemoryPayoutMethodRepository } from '@/infrastructure/payouts/InMemoryPayoutMethodRepository';
import { InMemoryUserProfileRepository } from '@/infrastructure/profile/InMemoryUserProfileRepository';

import {
  FakeDeviceLocale,
  FakeIdGenerator,
  FakeLayoutDirection,
  InMemoryLanguagePreference,
  InMemoryLanguageSyncState,
  InMemoryTokenStorage,
} from './ports';

interface TestAdapters {
  tokenStorage: InMemoryTokenStorage;
  languagePreference: InMemoryLanguagePreference;
  languageSyncState: InMemoryLanguageSyncState;
  deviceLocale: FakeDeviceLocale;
  layoutDirection: FakeLayoutDirection;
  authApi: InMemoryAuthApi;
  joinConfig: InMemoryJoinConfigRepository;
  circleQuote: InMemoryCircleQuoteRepository;
  circleMembership: InMemoryCircleMembershipRepository;
  userProfile: InMemoryUserProfileRepository;
  payoutMethods: InMemoryPayoutMethodRepository;
  ids: FakeIdGenerator;
}

/** Contenedor real con adaptadores en memoria: casos de uso reales, sin dispositivo ni red. */
export function createTestContainer(overrides: Partial<TestAdapters> = {}) {
  const adapters: TestAdapters = {
    tokenStorage: new InMemoryTokenStorage(),
    languagePreference: new InMemoryLanguagePreference(),
    languageSyncState: new InMemoryLanguageSyncState(),
    deviceLocale: new FakeDeviceLocale(),
    layoutDirection: new FakeLayoutDirection(),
    authApi: new InMemoryAuthApi({ latencyMs: 0 }),
    joinConfig: new InMemoryJoinConfigRepository('PEN', { latencyMs: 0 }),
    circleQuote: new InMemoryCircleQuoteRepository({ latencyMs: 0 }),
    circleMembership: new InMemoryCircleMembershipRepository({ latencyMs: 0 }),
    userProfile: new InMemoryUserProfileRepository({ latencyMs: 0 }),
    payoutMethods: new InMemoryPayoutMethodRepository('PEN', { latencyMs: 0 }),
    ids: new FakeIdGenerator(),
    ...overrides,
  };
  const env = parseEnv({ apiUrl: 'https://api.test.local/v1' });
  return { container: createContainer(env, adapters), adapters, env };
}
