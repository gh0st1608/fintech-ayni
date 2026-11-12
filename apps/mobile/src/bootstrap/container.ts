import {
  GetIdentityVerificationUseCase,
  ResumeIdentityVerificationUseCase,
  StartIdentityVerificationUseCase,
} from '@/application/documents/usecases/identityVerificationUseCases';
import type {
  IdentityVerificationRepositoryPort,
  WebAuthSessionPort,
} from '@/domain/documents/ports/IdentityVerificationPorts';
import {
  ExpoWebAuthSession,
  FakeWebAuthSession,
  IdentityVerificationApiRepository,
  InMemoryIdentityVerificationRepository,
} from '@/infrastructure/documents/IdentityVerificationAdapters';
import {
  CountUnreadNotificationsUseCase,
  ListNotificationsUseCase,
  MarkNotificationsReadUseCase,
} from '@/application/notifications/notificationUseCases';
import type { NotificationRepositoryPort } from '@/domain/notifications/NotificationRepositoryPort';
import { GetHelpUseCase } from '@/application/help/helpUseCases';
import type { HelpRepositoryPort } from '@/domain/help/HelpRepositoryPort';
import type { AppContainer } from '@/application/AppContainer';
import { SessionEvents } from '@/application/auth/SessionEvents';
import {
  DisableBiometricUnlockUseCase,
  EnableBiometricUnlockUseCase,
  GetBiometricStatusUseCase,
  ShouldRelockUseCase,
  UnlockWithBiometricsUseCase,
} from '@/application/auth/usecases/biometricUseCases';
import {
  ChangePasscodeUseCase,
  GetPasscodeStatusUseCase,
  UnlockWithPasscodeUseCase,
} from '@/application/auth/usecases/passcodeUseCases';
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
import { GetMyCircleUseCase } from '@/application/circles/usecases/GetMyCircleUseCase';
import { ListMyCirclesUseCase } from '@/application/circles/usecases/ListMyCirclesUseCase';
import { ListRecommendedCirclesUseCase } from '@/application/circles/usecases/ListRecommendedCirclesUseCase';
import {
  ListStartProposalsUseCase,
  RespondStartProposalUseCase,
} from '@/application/circles/usecases/startProposalUseCases';
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
  GetTransactionUseCase,
  GetPaymentStreakUseCase,
  CopyOperationNumberUseCase,
  ShareReceiptUseCase,
  UpdatePaymentSettingsUseCase,
} from '@/application/payments/usecases/paymentUseCases';
import {
  ListPayoutMethodsUseCase,
  SelectPayoutMethodUseCase,
  GetPayoutAccountUseCase,
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
import {
  GetSavingQuoteUseCase,
  ListMySavingsUseCase,
  SubscribeToSavingPlanUseCase,
  ListSavingPlansUseCase,
} from '@/application/savings/usecases/savingUseCases';
import { ChangeLanguageUseCase } from '@/application/i18n/usecases/ChangeLanguageUseCase';
import { ResolveDefaultCountryUseCase } from '@/application/auth/usecases/ResolveDefaultCountryUseCase';
import { ResolveLanguageUseCase } from '@/application/i18n/usecases/ResolveLanguageUseCase';
import { SyncLanguagePreferenceUseCase } from '@/application/i18n/usecases/SyncLanguagePreferenceUseCase';
import type { AuthApiPort } from '@/domain/auth/ports/AuthApiPort';
import type {
  BiometricAuthPort,
  BiometricPreferencePort,
} from '@/domain/auth/ports/BiometricPorts';
import type { PasscodeRepositoryPort } from '@/domain/auth/ports/PasscodeRepositoryPort';
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
import type { FileSharePort } from '@/domain/payments/ports/FileSharePort';
import { ExpoFileShare } from '@/infrastructure/payments/ExpoFileShare';
import type { PayoutMethodRepositoryPort } from '@/domain/payouts/ports/PayoutMethodRepositoryPort';
import type {
  ClipboardPort,
  PendingReferralPort,
  SharePort,
} from '@/domain/referrals/ports/DevicePorts';
import type { ReferralRepositoryPort } from '@/domain/referrals/ports/ReferralRepositoryPort';
import type { SavingPlanRepositoryPort } from '@/domain/savings/ports/SavingPlanRepositoryPort';
import type { UserProfileRepositoryPort } from '@/domain/profile/ports/UserProfileRepositoryPort';
import type { IdGeneratorPort } from '@/domain/shared/ports/IdGeneratorPort';
import { AuthApiRepository } from '@/infrastructure/auth/AuthApiRepository';
import { InMemoryAuthApi } from '@/infrastructure/auth/InMemoryAuthApi';
import { InMemoryPasscodeRepository } from '@/infrastructure/auth/InMemoryPasscodeRepository';
import { PasscodeApiRepository } from '@/infrastructure/auth/PasscodeApiRepository';
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
import { ExpoBiometricAuth } from '@/infrastructure/device/ExpoBiometricAuth';
import { ExpoCryptoIdGenerator } from '@/infrastructure/device/ExpoCryptoIdGenerator';
import { ExpoDeviceLocale } from '@/infrastructure/device/ExpoDeviceLocale';
import { ReactNativeLayoutDirection } from '@/infrastructure/device/ReactNativeLayoutDirection';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';
import { CardApiRepository } from '@/infrastructure/payments/CardApiRepository';
import {
  FakePaymentTokenizer,
  UnconfiguredPaymentTokenizer,
} from '@/infrastructure/payments/FakePaymentTokenizer';
import { MercadoPagoPaymentTokenizer } from '@/infrastructure/payments/MercadoPagoPaymentTokenizer';
import { InMemoryCardRepository } from '@/infrastructure/payments/InMemoryCardRepository';
import { InMemoryPaymentRepository } from '@/infrastructure/payments/InMemoryPaymentRepository';
import { PaymentApiRepository } from '@/infrastructure/payments/PaymentApiRepository';
import { HelpApiRepository } from '@/infrastructure/help/HelpApiRepository';
import { InMemoryHelpRepository } from '@/infrastructure/help/InMemoryHelpRepository';
import { InMemoryNotificationRepository } from '@/infrastructure/notifications/InMemoryNotificationRepository';
import { NotificationApiRepository } from '@/infrastructure/notifications/NotificationApiRepository';
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
import { InMemorySavingPlanRepository } from '@/infrastructure/savings/InMemorySavingPlanRepository';
import { SavingPlanApiRepository } from '@/infrastructure/savings/SavingPlanApiRepository';
import { AsyncStorageBiometricPreference } from '@/infrastructure/storage/AsyncStorageBiometricPreference';
import { AsyncStorageLanguagePreference } from '@/infrastructure/storage/AsyncStorageLanguagePreference';
import { AsyncStorageLanguageSyncState } from '@/infrastructure/storage/AsyncStorageLanguageSyncState';
import { SecureStoreTokenStorage } from '@/infrastructure/storage/SecureStoreTokenStorage';
import { SUPPORTED_LANGUAGES } from '@/presentation/i18n/languages';

import type { Env } from './env';

export interface ContainerAdapters {
  tokenStorage: TokenStoragePort;
  biometrics: BiometricAuthPort;
  biometricPreference: BiometricPreferencePort;
  languagePreference: LanguagePreferencePort;
  languageSyncState: LanguageSyncStatePort;
  deviceLocale: DeviceLocalePort;
  layoutDirection: LayoutDirectionPort;
  authApi: AuthApiPort;
  passcodes: PasscodeRepositoryPort;
  joinConfig: JoinConfigRepositoryPort;
  circleQuote: CircleQuoteRepositoryPort;
  circleMembership: CircleMembershipRepositoryPort;
  userProfile: UserProfileRepositoryPort;
  payoutMethods: PayoutMethodRepositoryPort;
  notifications: NotificationRepositoryPort;
  help: HelpRepositoryPort;
  payments: PaymentRepositoryPort;
  cards: CardRepositoryPort;
  paymentTokenizer: PaymentTokenizerPort;
  documents: DocumentRepositoryPort;
  filePicker: FilePickerPort;
  fileUploader: FileUploaderPort;
  identityVerification: IdentityVerificationRepositoryPort;
  webAuthSession: WebAuthSessionPort;
  fileCleaner: LocalFileCleanerPort;
  referrals: ReferralRepositoryPort;
  sharer: SharePort;
  clipboard: ClipboardPort;
  fileShare: FileSharePort;
  pendingReferral: PendingReferralPort;
  savings: SavingPlanRepositoryPort;
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
    biometrics: new ExpoBiometricAuth(),
    biometricPreference: new AsyncStorageBiometricPreference(),
    languagePreference: new AsyncStorageLanguagePreference(),
    languageSyncState: new AsyncStorageLanguageSyncState(),
    deviceLocale: new ExpoDeviceLocale(),
    layoutDirection: new ReactNativeLayoutDirection(),
    authApi: env.authApi === 'fake' ? new InMemoryAuthApi() : new AuthApiRepository(http),
    passcodes:
      env.authApi === 'fake' ? new InMemoryPasscodeRepository() : new PasscodeApiRepository(http),
    joinConfig:
      env.circlesApi === 'fake'
        ? // Simula que el backend también habilita dólares a un tipo de cambio fijo (M2).
          new InMemoryJoinConfigRepository(env.defaultCurrency, {
            secondCurrency: { code: 'USD', rateToOfficial: '3.75' },
          })
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
    help: env.helpApi === 'fake' ? new InMemoryHelpRepository() : new HelpApiRepository(http),
    notifications:
      env.notificationsApi === 'fake'
        ? new InMemoryNotificationRepository(env.defaultCurrency)
        : new NotificationApiRepository(http),
    payoutMethods:
      env.payoutsApi === 'fake'
        ? new InMemoryPayoutMethodRepository(env.defaultCurrency)
        : new PayoutMethodApiRepository(http),
    payments:
      env.paymentsApi === 'fake'
        ? new InMemoryPaymentRepository(env.defaultCurrency)
        : new PaymentApiRepository(http),
    cards: env.paymentsApi === 'fake' ? new InMemoryCardRepository() : new CardApiRepository(http),
    paymentTokenizer:
      env.paymentTokenizer === 'fake'
        ? new FakePaymentTokenizer()
        : env.paymentTokenizer === 'mercadopago' && env.mercadoPagoPublicKey
          ? new MercadoPagoPaymentTokenizer(
              { publicKey: env.mercadoPagoPublicKey, timeoutMs: env.httpTimeoutMs },
              overrides.ids ?? new ExpoCryptoIdGenerator(),
            )
          : new UnconfiguredPaymentTokenizer(),
    documents:
      env.documentsApi === 'fake'
        ? new InMemoryDocumentRepository()
        : new DocumentApiRepository(http),
    filePicker: new ExpoFilePicker(),
    // Con documentos falsos no hay URL real a la que subir.
    fileUploader: env.documentsApi === 'fake' ? new FakeFileUploader() : new FetchFileUploader(),
    fileCleaner: new ExpoLocalFileCleaner(),
    identityVerification:
      env.documentsApi === 'fake'
        ? new InMemoryIdentityVerificationRepository()
        : new IdentityVerificationApiRepository(http),
    // Con la verificación falsa no hay flujo web que abrir.
    webAuthSession:
      env.documentsApi === 'fake' ? new FakeWebAuthSession() : new ExpoWebAuthSession(),
    referrals:
      env.referralsApi === 'fake'
        ? new InMemoryReferralRepository({ currency: env.defaultCurrency })
        : new ReferralApiRepository(http),
    sharer: new ReactNativeShare(),
    clipboard: new ExpoClipboard(),
    fileShare: new ExpoFileShare(),
    pendingReferral: new AsyncStoragePendingReferral(),
    savings:
      env.savingsApi === 'fake'
        ? new InMemorySavingPlanRepository({ currency: env.defaultCurrency })
        : new SavingPlanApiRepository(http),
    ids: new ExpoCryptoIdGenerator(),
    ...overrides,
  };

  const documentUploader = new DocumentUploader(
    adapters.documents,
    adapters.fileUploader,
    adapters.fileCleaner,
  );
  const sessionEvents = new SessionEvents();
  const signOut = new SignOutUseCase(
    adapters.tokenStorage,
    adapters.authApi,
    adapters.biometricPreference,
  );
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
      /**
       * Pagos de prueba: la pasarela simulada o Mercado Pago con una public key `TEST-`. Habilita,
       * p. ej., los celulares de prueba de Yape.
       */
      paymentsSandbox:
        env.paymentTokenizer === 'fake' ||
        (env.paymentTokenizer === 'mercadopago' &&
          (env.mercadoPagoPublicKey?.startsWith('TEST-') ?? false)),
    },
    auth: {
      restoreSession: new RestoreSessionUseCase(
        adapters.tokenStorage,
        adapters.biometricPreference,
      ),
      signOut,
      refreshSession,
      sessionEvents,
      startAuthentication: new StartAuthenticationUseCase(adapters.authApi),
      verifyOtp: new VerifyOtpUseCase(adapters.authApi, adapters.tokenStorage),
      resendOtp: new ResendOtpUseCase(adapters.authApi),
      getBiometricStatus: new GetBiometricStatusUseCase(
        adapters.biometrics,
        adapters.biometricPreference,
      ),
      enableBiometricUnlock: new EnableBiometricUnlockUseCase(
        adapters.biometrics,
        adapters.biometricPreference,
      ),
      disableBiometricUnlock: new DisableBiometricUnlockUseCase(adapters.biometricPreference),
      unlockWithBiometrics: new UnlockWithBiometricsUseCase(adapters.biometrics),
      shouldRelock: new ShouldRelockUseCase(adapters.biometricPreference),
      getPasscodeStatus: new GetPasscodeStatusUseCase(adapters.passcodes),
      changePasscode: new ChangePasscodeUseCase(adapters.passcodes),
      unlockWithPasscode: new UnlockWithPasscodeUseCase(adapters.passcodes),
    },
    ids: adapters.ids,
    circles: {
      getJoinConfig: new GetJoinConfigUseCase(adapters.joinConfig),
      listInstallmentOptions: new ListInstallmentOptionsUseCase(adapters.circleQuote),
      listAvailableSlots: new ListAvailableSlotsUseCase(adapters.circleQuote),
      confirmSlotSelection: new ConfirmSlotSelectionUseCase(adapters.circleQuote),
      joinCircle: new JoinCircleUseCase(adapters.circleMembership, adapters.ids),
      listMyCircles: new ListMyCirclesUseCase(adapters.circleMembership),
      getMyCircle: new GetMyCircleUseCase(adapters.circleMembership),
      listRecommended: new ListRecommendedCirclesUseCase(adapters.circleQuote),
      listStartProposals: new ListStartProposalsUseCase(adapters.circleMembership),
      respondStartProposal: new RespondStartProposalUseCase(adapters.circleMembership),
    },
    payments: {
      getSummary: new GetPaymentSummaryUseCase(adapters.payments),
      listTransactions: new ListTransactionsUseCase(adapters.payments),
      getTransaction: new GetTransactionUseCase(adapters.payments),
      getPaymentStreak: new GetPaymentStreakUseCase(adapters.payments),
      copyOperationNumber: new CopyOperationNumberUseCase(adapters.clipboard),
      shareReceipt: new ShareReceiptUseCase(adapters.payments, adapters.fileShare),
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
      getIdentityVerification: new GetIdentityVerificationUseCase(adapters.identityVerification),
      startIdentityVerification: new StartIdentityVerificationUseCase(
        adapters.identityVerification,
        adapters.webAuthSession,
      ),
      resumeIdentityVerification: new ResumeIdentityVerificationUseCase(
        adapters.identityVerification,
        adapters.webAuthSession,
      ),
    },
    referrals: {
      getMine: new GetMyReferralUseCase(adapters.referrals),
      list: new ListReferralsUseCase(adapters.referrals),
      copyCode: new CopyReferralCodeUseCase(adapters.clipboard),
      shareInvite: new ShareInviteUseCase(adapters.sharer),
      capturePending: new CapturePendingReferralUseCase(adapters.pendingReferral),
      claimPending: new ClaimPendingReferralUseCase(adapters.referrals, adapters.pendingReferral),
    },
    savings: {
      listPlans: new ListSavingPlansUseCase(adapters.savings),
      getQuote: new GetSavingQuoteUseCase(adapters.savings),
      subscribe: new SubscribeToSavingPlanUseCase(adapters.savings),
      mine: new ListMySavingsUseCase(adapters.savings),
    },
    help: { get: new GetHelpUseCase(adapters.help) },
    notifications: {
      list: new ListNotificationsUseCase(adapters.notifications),
      countUnread: new CountUnreadNotificationsUseCase(adapters.notifications),
      markRead: new MarkNotificationsReadUseCase(adapters.notifications),
    },
    payouts: {
      listPayoutMethods: new ListPayoutMethodsUseCase(adapters.payoutMethods),
      selectPayoutMethod: new SelectPayoutMethodUseCase(adapters.payoutMethods),
      getPayoutAccount: new GetPayoutAccountUseCase(adapters.payoutMethods),
    },
    i18n: {
      resolveCountry: new ResolveDefaultCountryUseCase(adapters.deviceLocale),
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
