import { getLocales } from 'expo-localization';

import type { DeviceLocalePort } from '@/domain/i18n/ports/DeviceLocalePort';

export class ExpoDeviceLocale implements DeviceLocalePort {
  preferredLanguageCodes(): string[] {
    return getLocales()
      .map((locale) => locale.languageCode)
      .filter((code): code is string => !!code);
  }
}
