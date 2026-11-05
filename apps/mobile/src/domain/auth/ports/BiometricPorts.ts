export type BiometricAvailability = 'available' | 'no_hardware' | 'not_enrolled';

export type BiometricOutcome = 'success' | 'failed' | 'cancelled' | 'lockout' | 'unavailable';

export interface BiometricPrompt {
  message: string;
  cancelLabel: string;
}

/** Sensor biométrico del dispositivo. */
export interface BiometricAuthPort {
  availability(): Promise<BiometricAvailability>;
  authenticate(prompt: BiometricPrompt): Promise<BiometricOutcome>;
}

/** Si el usuario activó el desbloqueo biométrico en este dispositivo. No es un dato sensible. */
export interface BiometricPreferencePort {
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
}
