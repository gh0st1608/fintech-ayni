/** Canal por el que el backend envió el OTP. */
export type OtpChannel = 'email' | 'sms';

/**
 * Desafío de verificación abierto tras pedir el OTP. El destino llega enmascarado desde el
 * backend; la app nunca recibe ni guarda el código.
 */
export interface AuthChallenge {
  challengeId: string;
  channel: OtpChannel;
  maskedDestination: string;
  expiresAt: Date;
  /** A partir de cuándo se permite pedir otro código. */
  resendAvailableAt: Date;
}
