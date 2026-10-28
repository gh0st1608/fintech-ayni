/**
 * Política de OTP. Todos los valores son provisionales (pending-scope R10) y llegan de la
 * configuración validada.
 */
export interface OtpPolicy {
  readonly codeTtlSeconds: number;
  readonly resendCooldownSeconds: number;
  readonly maxAttempts: number;
  readonly maxResends: number;
}
