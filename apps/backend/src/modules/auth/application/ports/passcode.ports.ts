export const PASSCODE_REPOSITORY = Symbol('PASSCODE_REPOSITORY');
export const PASSCODE_HASHER = Symbol('PASSCODE_HASHER');
export const PASSCODE_POLICY = Symbol('PASSCODE_POLICY');

/** Supuestos de COPAYNI-23 (pending-scope D9), desde la configuración validada. */
export interface PasscodePolicy {
  /** Intentos fallidos seguidos antes de bloquear. */
  readonly maxAttempts: number;
  readonly lockSeconds: number;
}

export interface StoredPasscode {
  hash: string;
  lockedUntil: Date | null;
}

export interface PasscodeRepositoryPort {
  find(userId: string): Promise<StoredPasscode | null>;
  /** Crea o reemplaza el passcode y reinicia los fallos. */
  save(userId: string, hash: string): Promise<void>;
  /**
   * Suma un fallo de forma atómica, para que dos intentos simultáneos cuenten los dos. Al llegar a
   * `maxAttempts` bloquea hasta `lockUntil` y reinicia la cuenta. Devuelve los fallos acumulados.
   */
  recordFailure(userId: string, maxAttempts: number, lockUntil: Date): Promise<number>;
  clearFailures(userId: string): Promise<void>;
}

/** Hash lento con sal propia; `matches` compara en tiempo constante. */
export interface PasscodeHasherPort {
  hash(passcode: string): Promise<string>;
  matches(passcode: string, hash: string): Promise<boolean>;
}
