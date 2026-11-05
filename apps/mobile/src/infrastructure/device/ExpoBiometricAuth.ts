import * as LocalAuthentication from 'expo-local-authentication';

import type {
  BiometricAuthPort,
  BiometricAvailability,
  BiometricOutcome,
  BiometricPrompt,
} from '@/domain/auth/ports/BiometricPorts';

export class ExpoBiometricAuth implements BiometricAuthPort {
  async availability(): Promise<BiometricAvailability> {
    if (!(await LocalAuthentication.hasHardwareAsync())) return 'no_hardware';
    return (await LocalAuthentication.isEnrolledAsync()) ? 'available' : 'not_enrolled';
  }

  async authenticate({ message, cancelLabel }: BiometricPrompt): Promise<BiometricOutcome> {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: message,
      cancelLabel,
      // El método alternativo lo define la app: el PIN del dispositivo no abre la cuenta.
      disableDeviceFallback: true,
      fallbackLabel: '',
    });
    if (result.success) return 'success';
    switch (result.error) {
      case 'user_cancel':
      case 'system_cancel':
      case 'app_cancel':
        return 'cancelled';
      case 'lockout':
        return 'lockout';
      case 'not_enrolled':
      case 'not_available':
      case 'passcode_not_set':
        return 'unavailable';
      default:
        return 'failed';
    }
  }
}
