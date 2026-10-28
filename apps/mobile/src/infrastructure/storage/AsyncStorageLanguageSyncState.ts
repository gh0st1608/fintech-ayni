import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LanguageSyncStatePort } from '@/domain/i18n/ports/LanguageSyncStatePort';

const KEY = 'pref.language.syncPending';

export class AsyncStorageLanguageSyncState implements LanguageSyncStatePort {
  pending(): Promise<string | null> {
    return AsyncStorage.getItem(KEY);
  }

  markPending(languageCode: string): Promise<void> {
    return AsyncStorage.setItem(KEY, languageCode);
  }

  clear(): Promise<void> {
    return AsyncStorage.removeItem(KEY);
  }
}
