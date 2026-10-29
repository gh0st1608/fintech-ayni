import { type TrustProfile, type TrustSettings } from '../../domain/services/trust-policy';
import { type JoinEligibilityPort } from '../ports/join-eligibility.port';
import { type MemberHistoryPort } from '../ports/member-history.port';

export const TRUST_SETTINGS = Symbol('TRUST_SETTINGS');
export type { TrustSettings };

/** Perfil de confianza del usuario: su historial y sus datos de elegibilidad (COPAYNI-60). */
export async function trustProfileOf(
  userId: string,
  eligibility: JoinEligibilityPort,
  history: MemberHistoryPort,
): Promise<TrustProfile> {
  const [applicant, completedCircles] = await Promise.all([
    eligibility.applicantFor(userId),
    history.completedCirclesOf(userId),
  ]);
  return {
    completedCircles,
    identityVerified: applicant.identityVerified,
    incomeDeclared: applicant.incomeDeclared,
  };
}
