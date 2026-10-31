import type { AppContainer } from '@/application/AppContainer';
import { SessionEvents } from '@/application/auth/SessionEvents';
import { RefreshSessionUseCase } from '@/application/auth/usecases/RefreshSessionUseCase';
import { ResendOtpUseCase } from '@/application/auth/usecases/ResendOtpUseCase';
import { RestoreSessionUseCase } from '@/application/auth/usecases/RestoreSessionUseCase';
import { SignOutUseCase } from '@/application/auth/usecases/SignOutUseCase';
import { StartAuthenticationUseCase } from '@/application/auth/usecases/StartAuthenticationUseCase';
import { VerifyOtpUseCase } from '@/application/auth/usecases/VerifyOtpUseCase';
import { ConfirmSlotSelectionUseCase } from '@/application/circles/usecases/ConfirmSlotSelectionUseCase';
import { GetJoinConfigUseCase } from '@/application/circles/usecases/GetJoinConfigUseCase';
import { ListAvailableSlotsUseCase } from '@/application/circles/usecases/ListAvailableSlotsUseCase';
import { JoinCircleUseCase } from '@/application/circles/usecases/JoinCircleUseCase';
import { ListInstallmentOptionsUseCase } from '@/application/circles/usecases/ListInstallmentOptionsUseCase';
import { ListMyCirclesUseCase } from '@/application/circles/usecases/ListMyCirclesUseCase';
import { ListRecommendedCirclesUseCase } from '@/application/circles/usecases/ListRecommendedCirclesUseCase';
import {
  AddCardUseCase,
  ListCardsUseCase,
  PayInstallmentUseCase,
  RemoveCardUseCase,
  SetDefaultCardUseCase,
} from '@/application/payments/usecases/cardUseCases';
import {
  GetPaymentSettingsUseCase,
  GetPaymentSummaryUseCase,
  GetPayoutEligibilityUseCase,
  ListTransactionsUseCase,
  UpdatePaymentSettingsUseCase,
} from '@/application/payments/usecases/paymentUseCases';
import {
  ListPayoutMethodsUseCase,
  SelectPayoutMethodUseCase,
} from '@/application/payouts/usecases/payoutMethodUseCases';
import {
  GetMyProfileUseCase,
  StartContactChangeUseCase,
  UpdatePersonalInfoUseCase,
  VerifyContactChangeUseCase,
} from '@/application/profile/usecases/profileUseCases';
import {
  DocumentUploader,
  ListDocumentsUseCase,
  SubmitNationalIdUseCase,
  SubmitProofOfIncomeUseCase,
} from '@/application/documents/usecases/documentUseCases';
import {
  CapturePendingReferralUseCase,
  ClaimPendingReferralUseCase,
  CopyReferralCodeUseCase,
  GetMyReferralUseCase,
  ListReferralsUseCase,
  ShareInviteUseCase,
} from '@/application/referrals/usecases/referralUseCases';
import { ChangeLanguageUseCase } from '@/application/i18n/usecases/ChangeLanguageUseCase';
import { ResolveLanguageUseCase } from '@/application/i18n/usecases/ResolveLanguageUseCase';
import { SyncLanguagePreferenceUseCase } from '@/application/i18n/usecases/SyncLanguagePreferenceUseCase';
import type { AuthApiPort } from '@/domain/auth/ports/AuthApiPort';
import type { TokenStoragePort } from '@/domain/auth/ports/TokenStoragePort';
import type { CircleMembershipRepositoryPort } from '@/domain/circles/ports/CircleMembershipRepositoryPort';
import type { CircleQuoteRepositoryPort } from '@/domain/circles/ports/CircleQuoteRepositoryPort';
import type { JoinConfigRepositoryPort } from '@/domain/circles/ports/JoinConfigRepositoryPort';
import type { DocumentRepositoryPort } from '@/domain/documents/ports/DocumentRepositoryPort';
import type {
  FilePickerPort,
  FileUploaderPort,
  LocalFileCleanerPort,
} from '@/domain/documents/ports/FilePorts';
import type { DeviceLocalePort } from '@/domain/i18n/ports/DeviceLocalePort';
import type { LanguagePreferencePort } from '@/domain/i18n/ports/LanguagePreferencePort';
import type { LanguageSyncStatePort } from '@/domain/i18n/ports/LanguageSyncStatePort';
import type { LayoutDirectionPort } from '@/domain/i18n/ports/LayoutDirectionPort';
import type { CardRepositoryPort } from '@/domain/payments/ports/CardRepositoryPort';
import type { PaymentTokenizerPort } from '@/domain/payments/ports/CardTokenizerPort';
import type { PaymentRepositoryPort } from '@/domain/payments/ports/PaymentRepositoryPort';
import type { PayoutMethodRepositoryPort } from '@/domain/payouts/ports/PayoutMethodRepositoryPort';
import type {
  ClipboardPort,
  PendingReferralPort,
  SharePort,
} from '@/domain/referrals/ports/DevicePorts';
import type { ReferralRepositoryPort } from '@/domain/referrals/ports/ReferralRepositoryPort';
import type { UserProfileRepositoryPort } from '@/domain/profile/ports/UserProfileRepositoryPort';
import type { IdGeneratorPort } from '@/domain/shared/ports/IdGeneratorPort';
import { AuthApiRepository } from '@/infrastructure/auth/AuthApiRepository';
import { InMemoryAuthApi } from '@/infrastructure/auth/InMemoryAuthApi';
import { CircleMembershipApiRepository } from '@/infrastructure/circles/CircleMembershipApiRepository';
import { CircleQuoteApiRepository } from '@/infrastructure/circles/CircleQuoteApiRepository';
import { InMemoryCircleMembershipRepository } from '@/infrastructure/circles/InMemoryCircleMembershipRepository';
import { InMemoryCircleQuoteRepository } from '@/infrastructure/circles/InMemoryCircleQuoteRepository';
import { InMemoryJoinConfigRepository } from '@/infrastructure/circles/InMemoryJoinConfigRepository';
import { JoinConfigApiRepository } from '@/infrastructure/circles/JoinConfigApiRepository';
import { DocumentApiRepository } from '@/infrastructure/documents/DocumentApiRepository';
import {
  ExpoFilePicker,
  ExpoLocalFileCleaner,
  FetchFileUploader,
} from '@/infrastructure/documents/ExpoFileAdapters';
import {
  FakeFileUploader,
  InMemoryDocumentRepository,
} from '@/infrastructure/documents/InMemoryDocumentRepository';
import { ExpoCryptoIdGenerator } from '@/infrastructure/device/ExpoCryptoIdGenerator';
import { ExpoDeviceLocale } from '@/infrastructure/device/ExpoDeviceLocale';
import { ReactNativeLayoutDirection } from '@/infrastructure/device/ReactNativeLayoutDirection';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';
import { CardApiRepository } from '@/infrastructure/payments/CardApiRepository';
import {
  FakePaymentTokenizer,
  UnconfiguredPaymentTokenizer,
} from '@/infrastructure/payments/FakePaymentTokenizer';
import { InMemoryCardRepository } from '@/infrastructure/payments/InMemoryCardRepository';
import { InMemoryPaymentRepository } from '@/infrastructure/payments/InMemoryPaymentRepository';
import { PaymentApiRepository } from '@/infrastructure/payments/PaymentApiRepository';
import { InMemoryPayoutMethodRepository } from '@/infrastructure/payouts/InMemoryPayoutMethodRepository';
import { PayoutMethodApiRepository } from '@/infrastructure/payouts/PayoutMethodApiRepository';
import { InMemoryUserProfileRepository } from '@/infrastructure/profile/InMemoryUserProfileRepository';
import { UserProfileApiRepository } from '@/infrastructure/profile/UserProfileApiRepository';
import {
  AsyncStoragePendingReferral,
  ExpoClipboard,
  ReactNativeShare,
} from '@/infrastructure/referrals/DeviceReferralAdapters';
import { InMemoryReferralRepository } from '@/infrastructure/referrals/InMemoryReferralRepository';
import { ReferralApiRepository } from '@/infrastructure/referrals/ReferralApiRepository';
import { AsyncStorageLanguagePreference } from '@/infrastructure/storage/AsyncStorageLanguagePreference';
import { AsyncStorageLanguageSyncState } from '@/infrastructure/storage/AsyncStorageLanguageSyncState';
import { SecureStoreTokenStorage } from '@/infrastructure/storage/SecureStoreTokenStorage';
import { SUPPORTED_LANGUAGES } from '@/presentation/i18n/languages';

import type { Env } from './env';

export interface ContainerAdapters {
  tokenStorage: TokenStoragePort;
  languagePreference: LanguagePreferencePort;
  languageSyncState: LanguageSyncStatePort;
  deviceLocale: DeviceLocalePort;
  layoutDirection: LayoutDirectionPort;
  authApi: AuthApiPort;
  joinConfig: JoinConfigRepositoryPort;
  circleQuote: CircleQuoteRepositoryPort;
  circleMembership: CircleMembershipRepositoryPort;
  userProfile: UserProfileRepositoryPort;
  payoutMethods: PayoutMethodRepositoryPort;
  payments: PaymentRepositoryPort;
  cards: CardRepositoryPort;
  paymentTokenizer: PaymentTokenizerPort;
  documents: DocumentRepositoryPort;
  filePicker: FilePickerPort;
  fileUploader: FileUploaderPort;
  fileCleaner: LocalFileCleanerPort;
  referrals: ReferralRepositoryPort;
  sharer: SharePort;
  clipboard: ClipboardPort;
  pendingReferral: PendingReferralPort;
  ids: IdGeneratorPort;
}

/** Raíz de composición: único lugar que conoce las implementaciones concretas. */
export function createContainer(
  env: Env,
  overrides: Partial<ContainerAdapters> = {},
): AppContainer {
  const tokenStorage = overrides.tokenStorage ?? new SecureStoreTokenStorage();
  // El cliente HTTP y la renovación se necesitan mutuamente: la referencia se resuelve
  // al primer 401, cuando refreshSession ya está construido.
  const http = new FetchHttpClient({
    baseUrl: env.apiUrl,
    timeoutMs: env.httpTimeoutMs,
    getAccessToken: async () => (await tokenStorage.read())?.accessToken ?? null,
    renewSession: () => refreshSession.execute(),
    onUnauthorized: () => void refreshSession.expire(),
  });

  const adapters: ContainerAdapters = {
    tokenStorage,
    languagePreference: new AsyncStorageLanguagePreference(),
    languageSyncState: new AsyncStorageLanguageSyncState(),
    deviceLocale: new ExpoDeviceLocale(),
    layoutDirection: new ReactNativeLayoutDirection(),
    authApi: env.authApi === 'fake' ? new InMemoryAuthApi() : new AuthApiRepository(http),
    joinConfig:
      env.circlesApi === 'fake'
        ? new InMemoryJoinConfigRepository(env.defaultCurrency)
        : new JoinConfigApiRepository(http),
    circleQuote:
      env.circlesApi === 'fake'
        ? new InMemoryCircleQuoteRepository()
        : new CircleQuoteApiRepository(http),
    circleMembership:
      env.circlesApi === 'fake'
        ? new InMemoryCircleMembershipRepository()
        : new CircleMembershipApiRepository(http),
    userProfile:
      env.profileApi === 'fake'
        ? new InMemoryUserProfileRepository({ currency: env.defaultCurrency })
        : new UserProfileApiRepository(http),
    payoutMethods:
      env.payoutsApi === 'fake'
        ? new InMemoryPayoutMethodRepository(env.defaultCurrency)
        : new PayoutMethodApiRepository(http),
    payments:
      env.paymentsApi === 'fake'
        ? new InMemoryPaymentRepository(env.defaultCurrency)
        : new PaymentApiRepository(http),
    cards: env.paymentsApi === 'fake' ? new InMemoryCardRepository() : new CardApiRepository(http),
    // Mercado Pago simulado hasta usar la cuenta sandbox (COPAYNI-34).
    paymentTokenizer:
      env.paymentTokenizer === 'fake'
        ? new FakePaymentTokenizer()
        : new UnconfiguredPaymentTokenizer(),
    documents:
      env.documentsApi === 'fake'
        ? new InMemoryDocumentRepository()
        : new DocumentApiRepository(http),
    filePicker: new ExpoFilePicker(),
    // Con documentos falsos no hay URL real a la que subir.
    fileUploader: env.documentsApi === 'fake' ? new FakeFileUploader() : new FetchFileUploader(),
    fileCleaner: new ExpoLocalFileCleaner(),
    referrals:
      env.referralsApi === 'fake'
        ? new InMemoryReferralRepository({ currency: env.defaultCurrency })
        : new ReferralApiRepository(http),
    sharer: new ReactNativeShare(),
    clipboard: new ExpoClipboard(),
    pendingReferral: new AsyncStoragePendingReferral(),
    ids: new ExpoCryptoIdGenerator(),
    ...overrides,
  };

  const documentUploader = new DocumentUploader(
    adapters.documents,
    adapters.fileUploader,
    adapters.fileCleaner,
  );
  const sessionEvents = new SessionEvents();
  const signOut = new SignOutUseCase(adapters.tokenStorage, adapters.authApi);
  const refreshSession = new RefreshSessionUseCase(
    adapters.authApi,
    adapters.tokenStorage,
    signOut,
    sessionEvents,
  );

  return {
    config: {
      environment: env.appEnv,
      defaultCurrency: env.defaultCurrency,
      legal: { termsUrl: env.termsUrl, privacyUrl: env.privacyUrl },
    },
    auth: {
      restoreSession: new RestoreSessionUseCase(adapters.tokenStorage),
      signOut,
      refreshSession,
      sessionEvents,
      startAuthentication: new StartAuthenticationUseCase(adapters.authApi),
      verifyOtp: new VerifyOtpUseCase(adapters.authApi, adapters.tokenStorage),
      resendOtp: new ResendOtpUseCase(adapters.authApi),
    },
    ids: adapters.ids,
    circles: {
      getJoinConfig: new GetJoinConfigUseCase(adapters.joinConfig),
      listInstallmentOptions: new ListInstallmentOptionsUseCase(adapters.circleQuote),
      listAvailableSlots: new ListAvailableSlotsUseCase(adapters.circleQuote),
      confirmSlotSelection: new ConfirmSlotSelectionUseCase(adapters.circleQuote),
      joinCircle: new JoinCircleUseCase(adapters.circleMembership, adapters.ids),
      listMyCircles: new ListMyCirclesUseCase(adapters.circleMembership),
      listRecommended: new ListRecommendedCirclesUseCase(adapters.circleQuote),
    },
    payments: {
      getSummary: new GetPaymentSummaryUseCase(adapters.payments),
      listTransactions: new ListTransactionsUseCase(adapters.payments),
      getPayoutEligibility: new GetPayoutEligibilityUseCase(adapters.payments),
      getSettings: new GetPaymentSettingsUseCase(adapters.payments),
      updateSettings: new UpdatePaymentSettingsUseCase(adapters.payments),
      listCards: new ListCardsUseCase(adapters.cards),
      addCard: new AddCardUseCase(adapters.paymentTokenizer, adapters.cards),
      setDefaultCard: new SetDefaultCardUseCase(adapters.cards),
      removeCard: new RemoveCardUseCase(adapters.cards),
      payInstallment: new PayInstallmentUseCase(adapters.paymentTokenizer, adapters.payments),
    },
    profile: {
      getMyProfile: new GetMyProfileUseCase(adapters.userProfile),
      updatePersonalInfo: new UpdatePersonalInfoUseCase(adapters.userProfile),
      startContactChange: new StartContactChangeUseCase(adapters.userProfile),
      verifyContactChange: new VerifyContactChangeUseCase(adapters.userProfile),
    },
    documents: {
      list: new ListDocumentsUseCase(adapters.documents),
      submitNationalId: new SubmitNationalIdUseCase(adapters.documents, documentUploader),
      submitProofOfIncome: new SubmitProofOfIncomeUseCase(adapters.documents, documentUploader),
      picker: adapters.filePicker,
    },
    referrals: {
      getMine: new GetMyReferralUseCase(adapters.referrals),
      list: new ListReferralsUseCase(adapters.referrals),
      copyCode: new CopyReferralCodeUseCase(adapters.clipboard),
      shareInvite: new ShareInviteUseCase(adapters.sharer),
      capturePending: new CapturePendingReferralUseCase(adapters.pendingReferral),
      claimPending: new ClaimPendingReferralUseCase(adapters.referrals, adapters.pendingReferral),
    },
    payouts: {
      listPayoutMethods: new ListPayoutMethodsUseCase(adapters.payoutMethods),
      selectPayoutMethod: new SelectPayoutMethodUseCase(adapters.payoutMethods),
    },
    i18n: {
      resolveLanguage: new ResolveLanguageUseCase(
        adapters.languagePreference,
        adapters.deviceLocale,
        SUPPORTED_LANGUAGES,
        env.defaultLanguage,
      ),
      changeLanguage: new ChangeLanguageUseCase(
        adapters.languagePreference,
        adapters.layoutDirection,
        SUPPORTED_LANGUAGES,
      ),
      syncLanguagePreference: new SyncLanguagePreferenceUseCase(
        adapters.userProfile,
        adapters.languageSyncState,
      ),
    },
  };
}
