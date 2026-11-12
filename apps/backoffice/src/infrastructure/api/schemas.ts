import { z } from 'zod';

import { CYCLE_STATES } from '@/domain/circles/Circle';
import { KYC_STATUSES, KYC_TYPES } from '@/domain/kyc/Kyc';
import { STAFF_ROLES } from '@/domain/staff/Staff';
import { KYC_DOCUMENT_STATES, USER_STATUSES } from '@/domain/users/User';
import { INSTALLMENT_STATUSES } from '@/domain/finance/Finance';
import { APPROVAL_STATUSES, FUND_MOVEMENT_KINDS } from '@/domain/finance/Approval';
import { HELP_LANGUAGES } from '@/domain/help/Help';
import {
  BANK_ACCOUNT_TYPES,
  PAYOUT_ACCOUNT_KINDS,
  WALLET_PROVIDERS,
} from '@/domain/payouts/PayoutAccount';

/** Contratos de docs/api/admin.md en fintech-ayni. Se validan en runtime: TypeScript no basta. */
const money = z.object({ amount: z.number().int(), currency: z.string().length(3) });
const isoDate = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

export const staffMeSchema = z.object({
  staffId: z.string().min(1),
  email: z.string().nullable(),
  // Un rol que esta versión no conoce se ignora en vez de romper la sesión.
  roles: z
    .array(z.string())
    .transform((roles) => STAFF_ROLES.filter((role) => roles.includes(role))),
  authenticatedAt: isoDate,
});

export const devSessionSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
});

const summary = z.object({
  circleId: z.uuid(),
  state: z.enum(CYCLE_STATES),
  payout: money,
  months: z.number().int().positive(),
  startsOn: z.string().regex(/^\d{4}-\d{2}$/),
  members: z.number().int().nonnegative(),
  createdAt: isoDate,
});

export const circlesPageSchema = z.object({
  items: z.array(summary),
  nextCursor: z.string().nullable(),
});

export const circleDetailSchema = summary.extend({
  currentPeriod: z.string().nullable(),
  pausedOn: z.string().nullable(),
  memberships: z.array(
    z.object({
      userId: z.uuid(),
      position: z.number().int().positive(),
      name: z.string().nullable(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      joinedAt: isoDate,
      expelledAt: isoDate.nullable(),
    }),
  ),
  startProposal: z
    .object({
      round: z.number().int().positive(),
      payout: money,
      months: z.number().int().positive(),
      respondBy: z.string(),
      accepted: z.number().int().nonnegative(),
      withdrawn: z.number().int().nonnegative(),
    })
    .nullable(),
});

export const pauseResultSchema = z.object({
  state: z.enum(CYCLE_STATES),
  changed: z.boolean(),
});

const kycSummary = z.object({
  id: z.uuid(),
  type: z.enum(KYC_TYPES),
  kind: z.string(),
  status: z.enum(KYC_STATUSES),
  pages: z.number().int().nonnegative(),
  monthlyIncome: money.nullable(),
  submittedAt: isoDate,
  superseded: z.boolean(),
  subject: z.object({
    userId: z.uuid(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
});

export const kycReviewsPageSchema = z.object({
  items: z.array(kycSummary),
  nextCursor: z.string().nullable(),
});

export const kycReviewDetailSchema = kycSummary.extend({
  reason: z.string().nullable(),
  reviewedAt: isoDate.nullable(),
  reviewedBy: z.string().nullable(),
  pageFiles: z.array(
    z.object({
      page: z.number().int().positive(),
      purpose: z.string(),
      sizeBytes: z.number().int().nonnegative(),
    }),
  ),
});

export const kycPageUrlSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  expiresAt: isoDate,
});

const userSummary = z.object({
  userId: z.uuid(),
  status: z.enum(USER_STATUSES),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  preferredLanguage: z.string().nullable(),
  createdAt: isoDate,
  blocked: z.object({ at: isoDate, reason: z.string() }).nullable(),
});

export const usersSearchSchema = z.object({ items: z.array(userSummary) });

const kycState = z.enum(KYC_DOCUMENT_STATES);

export const userDetailSchema = userSummary.extend({
  kyc: z.object({ national_id: kycState, proof_of_income: kycState, additional: kycState }),
  circles: z.array(
    z.object({
      circleId: z.uuid(),
      state: z.enum(CYCLE_STATES),
      payout: money,
      months: z.number().int().positive(),
      position: z.number().int().positive(),
      joinedAt: isoDate,
      expelledAt: isoDate.nullable(),
    }),
  ),
});

const financeMember = z.object({ userId: z.uuid(), name: z.string().nullable() });
const period = z.string().regex(/^\d{4}-\d{2}$/);

export const installmentsPageSchema = z.object({
  totals: z.array(
    z.object({
      status: z.enum(INSTALLMENT_STATUSES),
      count: z.number().int().nonnegative(),
      total: money,
    }),
  ),
  items: z.array(
    z.object({
      id: z.uuid(),
      circleId: z.uuid(),
      position: z.number().int().positive(),
      period,
      dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      amount: money,
      status: z.enum(INSTALLMENT_STATUSES),
      paidAt: isoDate.nullable(),
      member: financeMember,
    }),
  ),
  nextCursor: z.string().nullable(),
});

export const payoutsPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      circleId: z.uuid(),
      position: z.number().int().positive(),
      period,
      amount: money,
      disbursedAt: isoDate,
      member: financeMember,
    }),
  ),
  nextCursor: z.string().nullable(),
});

export const guaranteeFundSchema = z.object({
  balances: z.array(
    z.object({
      balance: money,
      activeCircles: z.number().int().nonnegative(),
      minimum: money,
      belowMinimum: z.boolean(),
    }),
  ),
  items: z.array(
    z.object({
      transactionKey: z.string(),
      kind: z.string(),
      circleId: z.uuid().nullable(),
      period: period.nullable(),
      reason: z.string().nullable(),
      amount: money,
      createdAt: isoDate,
    }),
  ),
  nextCursor: z.string().nullable(),
});

export const revokeSessionsSchema = z.object({ revokedSessions: z.number().int().nonnegative() });

export const blockResultSchema = z.object({
  blocked: z.boolean(),
  changed: z.boolean(),
  revokedSessions: z.number().int().nonnegative(),
});

export const userContactSchema = z.object({
  email: z.string().nullable(),
  phone: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
});

export const supportNoteSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  authorId: z.string(),
  authorEmail: z.string().nullable(),
  createdAt: isoDate,
});

export const supportNotesSchema = z.object({ items: z.array(supportNoteSchema) });

const staffRef = z.object({ staffId: z.string().min(1), email: z.string().nullable() });

export const approvalSchema = z.object({
  id: z.uuid(),
  movement: z.object({
    kind: z.enum(FUND_MOVEMENT_KINDS),
    amount: money,
    reason: z.string(),
  }),
  status: z.enum(APPROVAL_STATUSES),
  proposedBy: staffRef,
  proposedAt: isoDate,
  expiresAt: isoDate,
  decidedBy: staffRef.nullable(),
  decidedAt: isoDate.nullable(),
  decisionReason: z.string().nullable(),
});

export const approvalsPageSchema = z.object({
  items: z.array(approvalSchema),
  nextCursor: z.string().nullable(),
});

export const delinquencyPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      circleId: z.uuid(),
      member: z.object({ userId: z.uuid(), name: z.string().nullable() }),
      period: z.string().regex(/^\d{4}-\d{2}$/),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      amount: money,
      lateFee: money.nullable(),
      settledAt: isoDate.nullable(),
      graceEndsOn: z.string().nullable(),
    }),
  ),
  nextCursor: z.string().nullable(),
  pending: z.array(money),
});

export const helpContentSchema = z.object({
  language: z.enum(HELP_LANGUAGES),
  faqs: z.array(z.object({ id: z.string().min(1), question: z.string(), answer: z.string() })),
  paymentPolicy: z.string().nullable(),
  updatedAt: isoDate.nullable(),
  updatedBy: z.string().nullable(),
});

export const payoutAccountSchema = z.object({
  id: z.uuid(),
  kind: z.enum(PAYOUT_ACCOUNT_KINDS),
  label: z.string().min(1),
  bankCode: z.string().nullable(),
  bankName: z.string().nullable(),
  accountType: z.enum(BANK_ACCOUNT_TYPES).nullable(),
  walletProvider: z.enum(WALLET_PROVIDERS).nullable(),
  last4: z.string().regex(/^\d{4}$/),
  holderName: z.string(),
  registeredAt: isoDate,
  registeredBy: z.string(),
  registeredByEmail: z.string().nullable(),
  replacedAt: isoDate.nullable(),
});

export const payoutAccountsSchema = z.object({
  current: payoutAccountSchema.nullable(),
  history: z.array(payoutAccountSchema),
  banks: z.record(z.string(), z.string()),
});

export const cycleRunsPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      startedAt: isoDate,
      finishedAt: isoDate,
      advanced: z.number().int().nonnegative(),
      locked: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      failures: z.array(z.object({ circleId: z.uuid(), reason: z.string() })),
    }),
  ),
  nextCursor: z.string().nullable(),
});
