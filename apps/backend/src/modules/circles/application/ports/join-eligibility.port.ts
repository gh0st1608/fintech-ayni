import { type JoinApplicant } from '../../domain/services/join-eligibility';

export const JOIN_ELIGIBILITY = Symbol('JOIN_ELIGIBILITY');

/** Datos del usuario que deciden si puede unirse: KYC (COPAYNI-47), límite (R5) y método de cobro. */
export interface JoinEligibilityPort {
  applicantFor(userId: string): Promise<JoinApplicant>;
}
