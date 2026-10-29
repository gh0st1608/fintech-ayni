import { type CircleRepositoryPort } from '@src/modules/circles/application/ports/circle-repository.port';
import { type MemberDebtsPort } from '@src/modules/circles/application/ports/member-debts.port';
import { type MemberHistoryPort } from '@src/modules/circles/application/ports/member-history.port';
import { type CircleAssignmentSettings } from '@src/modules/circles/application/use-cases/get-available-slots.use-case';
import { JoinCircleUseCase } from '@src/modules/circles/application/use-cases/join-circle.use-case';
import { type TrustSettings } from '@src/modules/circles/application/use-cases/trust';
import { type DelinquencyPolicy } from '@src/modules/circles/domain/entities/circle-cycle';
import { JoinConfig } from '@src/modules/circles/domain/entities/join-config';
import { type JoinApplicant } from '@src/modules/circles/domain/services/join-eligibility';
import { SlotPricing } from '@src/modules/circles/domain/services/slot-pricing';
import { PayoutRange } from '@src/modules/circles/domain/value-objects/payout-range';
import { SlotPricingRules } from '@src/modules/circles/domain/value-objects/slot-pricing-rules';
import { Money } from '@src/shared/domain/value-objects/money';

import { TestClock } from './create-test-app';

const pen = (major: number) => Money.of(major * 100, 'PEN');

/** Los valores por defecto de la configuración (iguales al adaptador falso de mobile). */
export const TEST_PRICING_RULES = SlotPricingRules.create({
  fastestShareBps: 2_500,
  highestShareBps: 2_500,
  maxFeeBps: 1_000,
  maxDiscountBps: 500,
  adminFeeBps: 1_200,
  adminFeeMode: 'added_to_installments',
});

export const TEST_PRICING = new SlotPricing(TEST_PRICING_RULES);

/** Los valores por defecto de la configuración: 3 días de gracia, mora de 3 % y penalidad de 5 %. */
export const TEST_DELINQUENCY: DelinquencyPolicy = {
  graceDays: 3,
  lateFeeBps: 300,
  refundPenaltyBps: 500,
};

/** Día de vencimiento de las cuotas en las pruebas de unión a una vacante (COPAYNI-59). */
export const TEST_DUE_DAY = 5;

/** 25 % de las Admin Fees al fondo de garantía, el valor por defecto (R18). */
export const TEST_FUND_SHARE_BPS = 2_500;

/**
 * Escenarios de capital semilla para las pruebas (el monto real lo decide el PO, R18). Siguen la
 * regla propuesta: el saldo mínimo de los círculos previstos para los 3 primeros meses, con el
 * círculo de referencia de §3.1 (30.000 PEN en 10 meses, cuota base de 3.000) y 2 cuotas base por
 * círculo: 6.000 PEN por círculo. Es lo que adelanta el fondo, como máximo, por una expulsión
 * sin reemplazo antes de recuperar el pozo del turno vacante.
 */
export const SEED_CAPITAL_SCENARIOS = [
  { name: 'conservador', circles: 5, seed: pen(30_000) },
  { name: 'base', circles: 10, seed: pen(60_000) },
  { name: 'expansión', circles: 20, seed: pen(120_000) },
] as const;

/** El valor por defecto de la regla de confianza: Fastest Payout pide 1 círculo completado. */
export const TEST_TRUST: TrustSettings = { fastestMinCompletedCircles: 1 };

/** Historial de un usuario con `completed` círculos completados sin expulsión. */
export const historyWith = (completed: number): MemberHistoryPort => ({
  completedCirclesOf: () => Promise.resolve(completed),
});

/** Sin deudas por impago: nadie está bloqueado. */
export const NO_DEBTS: MemberDebtsPort = {
  openDebtsOf: () => Promise.resolve([]),
  settle: () => Promise.resolve(null),
};

export const TEST_JOIN_CONFIG = JoinConfig.create({
  payoutRange: PayoutRange.create({ min: pen(3_000), max: pen(120_000), step: pen(500) }),
  savingProgramMax: pen(1_000_000),
  userPayoutLimit: null,
  durationOptions: [6, 10, 12],
});

/** Usuario con National ID, sin límite mensual y con método de cobro elegido. */
export const ELIGIBLE: JoinApplicant = {
  identityVerified: true,
  monthlyPayInLimit: null,
  incomeDeclared: true,
  payoutMethod: { type: 'bank_transfer', limit: null },
};

/** 15 de octubre de 2026 en Lima: los círculos que empiezan en noviembre todavía admiten miembros. */
export const JOIN_NOW = new Date('2026-10-15T15:00:00Z');

export function createJoinCircleUseCase(
  circles: CircleRepositoryPort,
  options: {
    applicant?: JoinApplicant;
    now?: Date;
    assignment?: Partial<CircleAssignmentSettings>;
    pricing?: SlotPricing;
    debts?: MemberDebtsPort;
    /** Círculos completados sin expulsión; por defecto 1, así puede tomar cualquier turno. */
    completedCircles?: number;
  } = {},
): JoinCircleUseCase {
  const applicant = options.applicant ?? ELIGIBLE;
  return new JoinCircleUseCase(
    { getForUser: () => Promise.resolve(TEST_JOIN_CONFIG) },
    circles,
    options.pricing ?? TEST_PRICING,
    {
      strategy: 'fill_oldest',
      startOffsetMonths: 1,
      timeZone: 'America/Lima',
      ...options.assignment,
    },
    { applicantFor: () => Promise.resolve(applicant) },
    options.debts ?? NO_DEBTS,
    { dueDay: TEST_DUE_DAY },
    historyWith(options.completedCircles ?? 1),
    TEST_TRUST,
    new TestClock(options.now ?? JOIN_NOW),
  );
}
