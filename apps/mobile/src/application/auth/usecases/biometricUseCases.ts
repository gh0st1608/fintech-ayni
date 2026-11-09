import type {
  BiometricAuthPort,
  BiometricAvailability,
  BiometricOutcome,
  BiometricPreferencePort,
  BiometricPrompt,
} from '@/domain/auth/ports/BiometricPorts';

/** Fallos seguidos antes de ofrecer el método alternativo (COPAYNI-22, supuesto de R14). */
export const MAX_BIOMETRIC_FAILURES = 3;

/** Tiempo en segundo plano tras el que se vuelve a pedir la biometría (supuesto de R14). */
export const RELOCK_AFTER_MS = 5 * 60 * 1000;

export interface BiometricStatus {
  availability: BiometricAvailability;
  /**
   * La preferencia guardada, aunque el sensor ya no esté disponible (p. ej. se borraron las
   * huellas): la app sigue bloqueándose y el usuario debe poder desactivarla.
   */
  enabled: boolean;
}

export class GetBiometricStatusUseCase {
  constructor(
    private readonly biometrics: BiometricAuthPort,
    private readonly preference: BiometricPreferencePort,
  ) {}

  async execute(): Promise<BiometricStatus> {
    const [availability, enabled] = await Promise.all([
      this.biometrics.availability(),
      this.preference.isEnabled(),
    ]);
    return { availability, enabled };
  }
}

/** Solo queda activada si el usuario confirma con el sensor. */
export class EnableBiometricUnlockUseCase {
  constructor(
    private readonly biometrics: BiometricAuthPort,
    private readonly preference: BiometricPreferencePort,
  ) {}

  async execute(prompt: BiometricPrompt): Promise<BiometricOutcome> {
    if ((await this.biometrics.availability()) !== 'available') return 'unavailable';
    const outcome = await this.biometrics.authenticate(prompt);
    if (outcome === 'success') await this.preference.setEnabled(true);
    return outcome;
  }
}

export class DisableBiometricUnlockUseCase {
  constructor(private readonly preference: BiometricPreferencePort) {}

  execute(): Promise<void> {
    return this.preference.setEnabled(false);
  }
}

export type UnlockResult =
  { status: 'unlocked' } | { status: 'retry'; failures: number } | { status: 'fallback' };

/**
 * Intenta salir del estado `locked`. Cancelar no cuenta como fallo. Si el sensor se bloqueó o dejó
 * de estar disponible, se ofrece el método alternativo sin más intentos.
 */
export class UnlockWithBiometricsUseCase {
  constructor(private readonly biometrics: BiometricAuthPort) {}

  async execute(prompt: BiometricPrompt, failures: number): Promise<UnlockResult> {
    if ((await this.biometrics.availability()) !== 'available') return { status: 'fallback' };
    const outcome = await this.biometrics.authenticate(prompt);
    switch (outcome) {
      case 'success':
        return { status: 'unlocked' };
      case 'cancelled':
        return { status: 'retry', failures };
      case 'failed':
        return failures + 1 >= MAX_BIOMETRIC_FAILURES
          ? { status: 'fallback' }
          : { status: 'retry', failures: failures + 1 };
      default:
        return { status: 'fallback' };
    }
  }
}

/**
 * Decide si la app debe bloquearse al volver de segundo plano. Si no se puede leer la preferencia,
 * se bloquea: es la misma incertidumbre que al restaurar la sesión, y ante ella se falla cerrado.
 */
export class ShouldRelockUseCase {
  constructor(private readonly preference: BiometricPreferencePort) {}

  async execute(backgroundMs: number): Promise<boolean> {
    if (backgroundMs < RELOCK_AFTER_MS) return false;
    return this.preference.isEnabled().catch(() => true);
  }
}
