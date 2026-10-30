export const PAYOUT_REQUIREMENTS = [
  'nationalId',
  'insuranceNote',
  'payoutMethod',
  'contract',
  'duePayments',
] as const;
export type PayoutRequirement = (typeof PAYOUT_REQUIREMENTS)[number];

/**
 * `met`: cumplido; `pending`: le falta y puede resolverlo; `unavailable`: le falta, pero la app
 * todavía no permite resolverlo (p. ej. la firma del contrato, D3).
 */
export type RequirementStatus = 'met' | 'pending' | 'unavailable';

/** Checklist de Payout Eligibility (GET /me/payout-eligibility, COPAYNI-36). */
export interface PayoutEligibility {
  isEligible: boolean;
  requirements: { requirement: PayoutRequirement; status: RequirementStatus }[];
}
