import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LanguagePreferencePort } from '@/domain/i18n/ports/LanguagePreferencePort';

const KEY = 'pref.language';

/** AsyncStorage solo guarda preferencias no sensibles; nunca tokens ni datos personales. */
export class AsyncStorageLanguagePreference implements LanguagePreferencePort {
  read(): Promise<string | null> {
    return AsyncStorage.getItem(KEY);
  }

  save(languageCode: string): Promise<void> {
    return AsyncStorage.setItem(KEY, languageCode);
  }
}
