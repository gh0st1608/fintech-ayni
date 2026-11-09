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
  /**
   * Ejecuta `work` con el passcode del usuario bloqueado: las verificaciones y los cambios del mismo
   * usuario se serializan, así ninguna lee un estado que otra está cambiando. Lo que `work` escribe
   * se confirma al terminar; por eso un rechazo se devuelve como valor y no se lanza dentro.
   */
  withLock<T>(userId: string, work: (locked: LockedPasscode) => Promise<T>): Promise<T>;
}

/** El passcode de un usuario dentro de `withLock`. */
export interface LockedPasscode {
  find(): Promise<StoredPasscode | null>;
  /** Crea o reemplaza el passcode y reinicia los fallos. */
  save(hash: string): Promise<void>;
  /**
   * Suma un fallo. Al llegar a `maxAttempts` bloquea hasta `lockUntil` y reinicia la cuenta.
   * Devuelve los fallos acumulados.
   */
  recordFailure(maxAttempts: number, lockUntil: Date): Promise<number>;
  clearFailures(): Promise<void>;
}

/** Hash lento con sal propia; `matches` compara en tiempo constante. */
export interface PasscodeHasherPort {
  hash(passcode: string): Promise<string>;
  matches(passcode: string, hash: string): Promise<boolean>;
}
