import { createContainer } from '@/bootstrap/container';
import { parseEnv } from '@/bootstrap/env';

import { InMemoryAuthApi } from '@/infrastructure/auth/InMemoryAuthApi';
import { InMemoryCircleMembershipRepository } from '@/infrastructure/circles/InMemoryCircleMembershipRepository';
import { InMemoryCircleQuoteRepository } from '@/infrastructure/circles/InMemoryCircleQuoteRepository';
import { InMemoryJoinConfigRepository } from '@/infrastructure/circles/InMemoryJoinConfigRepository';
import { FakePaymentTokenizer } from '@/infrastructure/payments/FakePaymentTokenizer';
import { InMemoryCardRepository } from '@/infrastructure/payments/InMemoryCardRepository';
import { InMemoryPaymentRepository } from '@/infrastructure/payments/InMemoryPaymentRepository';
import {
  FakeFileUploader,
  FakeLocalFileCleaner,
  InMemoryDocumentRepository,
} from '@/infrastructure/documents/InMemoryDocumentRepository';

import { FakeFilePicker } from './FakeFilePicker';
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
  payments: InMemoryPaymentRepository;
  cards: InMemoryCardRepository;
  paymentTokenizer: FakePaymentTokenizer;
  documents: InMemoryDocumentRepository;
  filePicker: FakeFilePicker;
  fileUploader: FakeFileUploader;
  fileCleaner: FakeLocalFileCleaner;
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
    userProfile: new InMemoryUserProfileRepository({ latencyMs: 0, currency: 'PEN' }),
    payoutMethods: new InMemoryPayoutMethodRepository('PEN', { latencyMs: 0 }),
    payments: new InMemoryPaymentRepository('PEN', { latencyMs: 0 }),
    cards: new InMemoryCardRepository({ latencyMs: 0 }),
    paymentTokenizer: new FakePaymentTokenizer({ latencyMs: 0 }),
    documents: new InMemoryDocumentRepository({ latencyMs: 0 }),
    filePicker: new FakeFilePicker(),
    fileUploader: new FakeFileUploader(),
    fileCleaner: new FakeLocalFileCleaner(),
    ids: new FakeIdGenerator(),
    ...overrides,
  };
  const env = parseEnv({ apiUrl: 'https://api.test.local/v1' });
  return { container: createContainer(env, adapters), adapters, env };
}
