import type {
  CircleDetail,
  CirclesPage,
  CircleSummary,
  PauseAction,
  PauseResult,
} from '@/domain/circles/Circle';
import {
  type KycApproval,
  type KycPageUrl,
  type KycRejection,
  type KycReviewDetail,
  type KycReviewsPage,
  REJECTION_REASONS,
} from '@/domain/kyc/Kyc';
import type {
  CirclesFilter,
  CirclesRepositoryPort,
  DevCredentials,
  KycFilter,
  KycRepositoryPort,
  StaffAuthPort,
} from '@/domain/ports';
import { AppError } from '@/domain/shared/AppError';
import type { StaffMember } from '@/domain/staff/Staff';

export const NOW = new Date('2026-11-09T15:00:00Z');

export class InMemoryStaffAuth implements StaffAuthPort {
  staff: StaffMember | null = null;

  signIn(credentials: DevCredentials): Promise<StaffMember> {
    this.staff = {
      staffId: `dev:${credentials.email}`,
      email: credentials.email,
      roles: credentials.roles,
      authenticatedAt: NOW,
    };
    return Promise.resolve(this.staff);
  }

  current(): Promise<StaffMember | null> {
    return Promise.resolve(this.staff);
  }

  signOut(): void {
    this.staff = null;
  }
}

let sequence = 0;

export function circle(overrides: Partial<CircleDetail> = {}): CircleDetail {
  sequence += 1;
  const id = `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
  return {
    circleId: id,
    state: 'contributing',
    payout: { amount: 600_000, currency: 'PEN' },
    months: 6,
    startsOn: '2026-12',
    members: 4,
    createdAt: NOW,
    currentPeriod: '2026-12',
    pausedOn: null,
    memberships: [
      {
        userId: '11111111-1111-4111-8111-111111111111',
        position: 1,
        name: 'Juana P.',
        email: 'j***@mail.com',
        phone: '+51******321',
        joinedAt: NOW,
        expelledAt: null,
      },
    ],
    startProposal: null,
    ...overrides,
  };
}

export class InMemoryCircles implements CirclesRepositoryPort {
  readonly pauses: { circleId: string; action: PauseAction; reason: string }[] = [];
  pageSize = 25;

  constructor(public circles: CircleDetail[] = []) {}

  list(filter: CirclesFilter): Promise<CirclesPage> {
    const matching = this.circles.filter(({ state }) => !filter.state || state === filter.state);
    const start = filter.cursor ? Number(filter.cursor) : 0;
    const items: CircleSummary[] = structuredClone(matching.slice(start, start + this.pageSize));
    const next = start + this.pageSize;
    return Promise.resolve({ items, nextCursor: next < matching.length ? String(next) : null });
  }

  get(circleId: string): Promise<CircleDetail> {
    const found = this.circles.find((item) => item.circleId === circleId);
    // Copias, como un backend real: el doble modifica sus juntas al pausar.
    return found
      ? Promise.resolve(structuredClone(found))
      : Promise.reject(new AppError('not_found', 'No existe', 'CIRCLE_NOT_FOUND'));
  }

  setPause(circleId: string, action: PauseAction, reason: string): Promise<PauseResult> {
    this.pauses.push({ circleId, action, reason });
    const found = this.circles.find((item) => item.circleId === circleId);
    if (found) found.state = action === 'pause' ? 'paused' : 'contributing';
    return Promise.resolve({ state: found?.state ?? 'paused', changed: true });
  }
}

export function kycReview(overrides: Partial<KycReviewDetail> = {}): KycReviewDetail {
  sequence += 1;
  return {
    id: `00000000-0000-4000-9000-${String(sequence).padStart(12, '0')}`,
    type: 'national_id',
    kind: 'national_id',
    status: 'in_review',
    pages: 2,
    monthlyIncome: null,
    submittedAt: NOW,
    superseded: false,
    subject: {
      userId: '22222222-2222-4222-8222-222222222222',
      name: 'Ana R.',
      email: 'a***@mail.com',
      phone: null,
    },
    reason: null,
    reviewedAt: null,
    reviewedBy: null,
    pageFiles: [
      { page: 1, purpose: 'national_id_front', sizeBytes: 1024 },
      { page: 2, purpose: 'national_id_back', sizeBytes: 1024 },
    ],
    ...overrides,
  };
}

/** Cola de KYC en memoria: resuelve como el backend, incluido el 409 si ya se resolvió. */
export class InMemoryKyc implements KycRepositoryPort {
  readonly approvals: { id: string; approval: KycApproval }[] = [];
  readonly rejections: { id: string; rejection: KycRejection }[] = [];
  readonly viewed: { id: string; page: number }[] = [];
  pageSize = 25;

  constructor(public reviews: KycReviewDetail[] = []) {}

  list(filter: KycFilter): Promise<KycReviewsPage> {
    const matching = this.reviews.filter(
      (review) => review.status === filter.status && (!filter.type || review.type === filter.type),
    );
    const start = filter.cursor ? Number(filter.cursor) : 0;
    const items = structuredClone(matching.slice(start, start + this.pageSize));
    const next = start + this.pageSize;
    return Promise.resolve({ items, nextCursor: next < matching.length ? String(next) : null });
  }

  get(id: string): Promise<KycReviewDetail> {
    const found = this.reviews.find((review) => review.id === id);
    return found
      ? Promise.resolve(structuredClone(found))
      : Promise.reject(new AppError('not_found', 'No existe', 'KYC_REVIEW_NOT_FOUND'));
  }

  pageUrl(id: string, page: number): Promise<KycPageUrl> {
    this.viewed.push({ id, page });
    return Promise.resolve({
      url: `https://s3.test/kyc/${id}/${String(page)}?X-Amz-Expires=60`,
      expiresAt: new Date(NOW.getTime() + 60_000),
    });
  }

  approve(id: string, approval: KycApproval): Promise<KycReviewDetail> {
    this.approvals.push({ id, approval });
    return this.decide(id, (review) => {
      review.status = 'approved';
      if (approval.monthlyIncome !== undefined && review.monthlyIncome) {
        review.monthlyIncome = { ...review.monthlyIncome, amount: approval.monthlyIncome };
      }
    });
  }

  reject(id: string, rejection: KycRejection): Promise<KycReviewDetail> {
    this.rejections.push({ id, rejection });
    return this.decide(id, (review) => {
      review.status = 'rejected';
      review.reason = REJECTION_REASONS[rejection.reason];
    });
  }

  private decide(id: string, change: (review: KycReviewDetail) => void): Promise<KycReviewDetail> {
    const found = this.reviews.find((review) => review.id === id);
    if (!found) return Promise.reject(new AppError('not_found', 'No existe'));
    if (found.status !== 'in_review') {
      return Promise.reject(
        new AppError('conflict', 'Este documento ya fue revisado', 'KYC_ALREADY_REVIEWED'),
      );
    }
    change(found);
    found.reviewedAt = NOW;
    found.reviewedBy = 'dev:ops@ayni.local';
    return Promise.resolve(structuredClone(found));
  }
}
