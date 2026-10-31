import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';

import type {
  ClipboardPort,
  PendingReferralPort,
  SharePort,
} from '@/domain/referrals/ports/DevicePorts';

/** Hoja nativa de compartir (API Share de React Native). */
export class ReactNativeShare implements SharePort {
  async share(message: string): Promise<boolean> {
    const result = await Share.share({ message });
    return result.action !== Share.dismissedAction;
  }
}

export class ExpoClipboard implements ClipboardPort {
  async copy(text: string): Promise<void> {
    await Clipboard.setStringAsync(text);
  }
}

const KEY = 'referral.pendingCode';

/** El código de invitación no es sensible: AsyncStorage basta. */
export class AsyncStoragePendingReferral implements PendingReferralPort {
  get(): Promise<string | null> {
    return AsyncStorage.getItem(KEY);
  }

  save(code: string): Promise<void> {
    return AsyncStorage.setItem(KEY, code);
  }

  clear(): Promise<void> {
    return AsyncStorage.removeItem(KEY);
  }
}
