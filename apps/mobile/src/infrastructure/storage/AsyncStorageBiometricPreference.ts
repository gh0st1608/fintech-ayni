import AsyncStorage from '@react-native-async-storage/async-storage';

import type { BiometricPreferencePort } from '@/domain/auth/ports/BiometricPorts';

const KEY = 'pref.biometricUnlock';

export class AsyncStorageBiometricPreference implements BiometricPreferencePort {
  async isEnabled(): Promise<boolean> {
    return (await AsyncStorage.getItem(KEY)) === 'true';
  }

  setEnabled(enabled: boolean): Promise<void> {
    return enabled ? AsyncStorage.setItem(KEY, 'true') : AsyncStorage.removeItem(KEY);
  }
}
