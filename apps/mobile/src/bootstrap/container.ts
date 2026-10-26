import type { AppContainer } from '@/application/AppContainer';
import { RestoreSessionUseCase } from '@/application/auth/usecases/RestoreSessionUseCase';
import { SignInUseCase } from '@/application/auth/usecases/SignInUseCase';
import { SignOutUseCase } from '@/application/auth/usecases/SignOutUseCase';
import { ChangeLanguageUseCase } from '@/application/i18n/usecases/ChangeLanguageUseCase';
import { ResolveLanguageUseCase } from '@/application/i18n/usecases/ResolveLanguageUseCase';
import type { TokenStoragePort } from '@/domain/auth/ports/TokenStoragePort';
import type { DeviceLocalePort } from '@/domain/i18n/ports/DeviceLocalePort';
import type { LanguagePreferencePort } from '@/domain/i18n/ports/LanguagePreferencePort';
import type { LayoutDirectionPort } from '@/domain/i18n/ports/LayoutDirectionPort';
import { ExpoDeviceLocale } from '@/infrastructure/device/ExpoDeviceLocale';
import { ReactNativeLayoutDirection } from '@/infrastructure/device/ReactNativeLayoutDirection';
import { AsyncStorageLanguagePreference } from '@/infrastructure/storage/AsyncStorageLanguagePreference';
import { SecureStoreTokenStorage } from '@/infrastructure/storage/SecureStoreTokenStorage';
import { SUPPORTED_LANGUAGES } from '@/presentation/i18n/languages';

import type { Env } from './env';

export interface ContainerAdapters {
  tokenStorage: TokenStoragePort;
  languagePreference: LanguagePreferencePort;
  deviceLocale: DeviceLocalePort;
  layoutDirection: LayoutDirectionPort;
}

/**
 * Raíz de composición: único lugar que conoce las implementaciones concretas.
 * El FetchHttpClient se compone aquí con el primer repositorio que lo necesite (COPAYNI-19).
 */
export function createContainer(
  env: Env,
  overrides: Partial<ContainerAdapters> = {},
): AppContainer {
  const adapters: ContainerAdapters = {
    tokenStorage: new SecureStoreTokenStorage(),
    languagePreference: new AsyncStorageLanguagePreference(),
    deviceLocale: new ExpoDeviceLocale(),
    layoutDirection: new ReactNativeLayoutDirection(),
    ...overrides,
  };

  return {
    config: { environment: env.appEnv, defaultCurrency: env.defaultCurrency },
    auth: {
      restoreSession: new RestoreSessionUseCase(adapters.tokenStorage),
      signIn: new SignInUseCase(adapters.tokenStorage),
      signOut: new SignOutUseCase(adapters.tokenStorage),
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
    },
  };
}
