import { Inject, Injectable } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { JOIN_ELIGIBILITY, type JoinEligibilityPort } from '../ports/join-eligibility.port';
import { MEMBER_DEBTS, type MemberDebtsPort } from '../ports/member-debts.port';
import {
  MEMBERSHIP_AGREEMENTS,
  type MembershipAgreementsPort,
} from '../ports/membership-agreements.port';
import { PAYMENTS_QUERY, type PaymentsQueryPort } from '../ports/payments-query.port';

/** Requisitos del checklist de Payout Eligibility, en el orden del Figma (55:9892). */
export const PAYOUT_REQUIREMENTS = [
  'national_id',
  'insurance_note',
  'payout_method',
  'contract',
  'due_payments',
] as const;
export type PayoutRequirement = (typeof PAYOUT_REQUIREMENTS)[number];

/**
 * `met`: cumplido. `pending`: falta y el usuario puede resolverlo. `unavailable`: falta, pero la
 * app todavía no permite resolverlo; hoy ningún requisito queda así.
 */
export type RequirementStatus = 'met' | 'pending' | 'unavailable';

export interface PayoutEligibility {
  requirements: { requirement: PayoutRequirement; status: RequirementStatus }[];
  isEligible: boolean;
}

/**
 * Qué le falta al usuario para cobrar su payout (COPAYNI-36). El backend es la fuente de verdad:
 * - National ID: el estado del KYC (COPAYNI-47), o asumido con `JOIN_IDENTITY_CHECK`.
 * - Método de cobro: elegido y todavía disponible (COPAYNI-37).
 * - Pagos al día: ninguna cuota con el cobro fallido ni deuda por impago (COPAYNI-57).
 * - Contrato y pagaré: firmados con el código al celular (COPAYNI-89). Quedan `pending` mientras
 *   le falte firmar algún acuerdo; quien se unió antes de COPAYNI-89 no tiene acuerdos y los
 *   cumple, porque no se le puede exigir una firma retroactiva. Esa exención es la razón por la
 *   que unirse **no** puede fallar en silencio al abrir los acuerdos: sin fila, esto los daría
 *   por cumplidos sin firma (ver `openAgreements` en `join-circle.use-case.ts`).
 *
 * Hoy es informativo: el ciclo mensual no retiene el payout por estos requisitos hasta que el PO
 * decida qué pasa si llega el turno sin cumplirlos.
 */
@Injectable()
export class GetPayoutEligibilityUseCase {
  constructor(
    @Inject(JOIN_ELIGIBILITY) private readonly eligibility: JoinEligibilityPort,
    @Inject(PAYMENTS_QUERY) private readonly payments: PaymentsQueryPort,
    @Inject(MEMBER_DEBTS) private readonly debts: MemberDebtsPort,
    @Inject(MEMBERSHIP_AGREEMENTS) private readonly agreements: MembershipAgreementsPort,
  ) {}

  async execute(principal: Principal): Promise<PayoutEligibility> {
    const { userId } = principal;
    const [applicant, due, debts, unsigned] = await Promise.all([
      this.eligibility.applicantFor(userId),
      this.payments.dueInstallmentsOf(userId),
      this.debts.openDebtsOf(userId),
      this.agreements.hasUnsigned(userId),
    ]);
    const upToDate = debts.length === 0 && due.every(({ status }) => status !== 'overdue');
    const signed: RequirementStatus = unsigned ? 'pending' : 'met';
    const status: Record<PayoutRequirement, RequirementStatus> = {
      national_id: applicant.identityVerified ? 'met' : 'pending',
      insurance_note: signed,
      payout_method: applicant.payoutMethod ? 'met' : 'pending',
      contract: signed,
      due_payments: upToDate ? 'met' : 'pending',
    };
    const requirements = PAYOUT_REQUIREMENTS.map((requirement) => ({
      requirement,
      status: status[requirement],
    }));
    return { requirements, isEligible: requirements.every(({ status: s }) => s === 'met') };
  }
}
