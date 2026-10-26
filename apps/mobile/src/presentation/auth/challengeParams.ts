import type { AuthChallenge, OtpChannel } from '@/domain/auth/AuthChallenge';

/**
 * Parámetros de ruta de Verify OTP. Solo datos no sensibles: el destino ya llega enmascarado
 * y el código nunca viaja por la navegación.
 */
export type ChallengeParams = {
  challengeId: string;
  channel: OtpChannel;
  destination: string;
  expiresAt: string;
  resendAt: string;
};

export function toChallengeParams(challenge: AuthChallenge): ChallengeParams {
  return {
    challengeId: challenge.challengeId,
    channel: challenge.channel,
    destination: challenge.maskedDestination,
    expiresAt: challenge.expiresAt.toISOString(),
    resendAt: challenge.resendAvailableAt.toISOString(),
  };
}

function toDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Reconstruye el desafío; null si la ruta se abrió sin datos válidos (p. ej. deep link). */
export function fromChallengeParams(
  params: Partial<Record<keyof ChallengeParams, unknown>>,
): AuthChallenge | null {
  const expiresAt = toDate(params.expiresAt);
  const resendAvailableAt = toDate(params.resendAt);
  const { challengeId, channel, destination } = params;
  if (
    typeof challengeId !== 'string' ||
    !challengeId ||
    (channel !== 'email' && channel !== 'sms') ||
    typeof destination !== 'string' ||
    !expiresAt ||
    !resendAvailableAt
  ) {
    return null;
  }
  return { challengeId, channel, maskedDestination: destination, expiresAt, resendAvailableAt };
}
