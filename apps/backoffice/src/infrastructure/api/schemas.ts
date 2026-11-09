import { z } from 'zod';

import { CYCLE_STATES } from '@/domain/circles/Circle';
import { KYC_STATUSES, KYC_TYPES } from '@/domain/kyc/Kyc';
import { STAFF_ROLES } from '@/domain/staff/Staff';

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
