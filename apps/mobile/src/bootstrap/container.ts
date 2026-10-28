import type { AppContainer } from '@/application/AppContainer';
import { SessionEvents } from '@/application/auth/SessionEvents';
import { RefreshSessionUseCase } from '@/application/auth/usecases/RefreshSessionUseCase';
import { ResendOtpUseCase } from '@/application/auth/usecases/ResendOtpUseCase';
import { RestoreSessionUseCase } from '@/application/auth/usecases/RestoreSessionUseCase';
import { SignOutUseCase } from '@/application/auth/usecases/SignOutUseCase';
import { StartAuthenticationUseCase } from '@/application/auth/usecases/StartAuthenticationUseCase';
import { VerifyOtpUseCase } from '@/application/auth/usecases/VerifyOtpUseCase';
import { GetJoinConfigUseCase } from '@/application/circles/usecases/GetJoinConfigUseCase';
import { ListInstallmentOptionsUseCase } from '@/application/circles/usecases/ListInstallmentOptionsUseCase';
import { ChangeLanguageUseCase } from '@/application/i18n/usecases/ChangeLanguageUseCase';
import { ResolveLanguageUseCase } from '@/application/i18n/usecases/ResolveLanguageUseCase';
import { SyncLanguagePreferenceUseCase } from '@/application/i18n/usecases/SyncLanguagePreferenceUseCase';
import type { AuthApiPort } from '@/domain/auth/ports/AuthApiPort';
import type { TokenStoragePort } from '@/domain/auth/ports/TokenStoragePort';
import type { CircleQuoteRepositoryPort } from '@/domain/circles/ports/CircleQuoteRepositoryPort';
import type { JoinConfigRepositoryPort } from '@/domain/circles/ports/JoinConfigRepositoryPort';
import type { DeviceLocalePort } from '@/domain/i18n/ports/DeviceLocalePort';
import type { LanguagePreferencePort } from '@/domain/i18n/ports/LanguagePreferencePort';
import type { LanguageSyncStatePort } from '@/domain/i18n/ports/LanguageSyncStatePort';
import type { LayoutDirectionPort } from '@/domain/i18n/ports/LayoutDirectionPort';
import type { UserProfileRepositoryPort } from '@/domain/profile/ports/UserProfileRepositoryPort';
import { AuthApiRepository } from '@/infrastructure/auth/AuthApiRepository';
import { InMemoryAuthApi } from '@/infrastructure/auth/InMemoryAuthApi';
import { CircleQuoteApiRepository } from '@/infrastructure/circles/CircleQuoteApiRepository';
import { InMemoryCircleQuoteRepository } from '@/infrastructure/circles/InMemoryCircleQuoteRepository';
import { InMemoryJoinConfigRepository } from '@/infrastructure/circles/InMemoryJoinConfigRepository';
import { JoinConfigApiRepository } from '@/infrastructure/circles/JoinConfigApiRepository';
import { ExpoDeviceLocale } from '@/infrastructure/device/ExpoDeviceLocale';
import { ReactNativeLayoutDirection } from '@/infrastructure/device/ReactNativeLayoutDirection';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';
import { InMemoryUserProfileRepository } from '@/infrastructure/profile/InMemoryUserProfileRepository';
import { UserProfileApiRepository } from '@/infrastructure/profile/UserProfileApiRepository';
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
  userProfile: UserProfileRepositoryPort;
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
    userProfile:
      env.profileApi === 'fake'
        ? new InMemoryUserProfileRepository()
        : new UserProfileApiRepository(http),
    ...overrides,
  };

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
    circles: {
      getJoinConfig: new GetJoinConfigUseCase(adapters.joinConfig),
      listInstallmentOptions: new ListInstallmentOptionsUseCase(adapters.circleQuote),
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
