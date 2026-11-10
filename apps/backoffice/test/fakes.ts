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
  UsersRepositoryPort,
  FinanceRepositoryPort,
  InstallmentsFilter,
  CycleRunsRepositoryPort,
} from '@/domain/ports';
import { AppError } from '@/domain/shared/AppError';
import type { StaffMember } from '@/domain/staff/Staff';
import type {
  BlockResult,
  SupportNote,
  UserContact,
  UserDetail,
  UserSummary,
} from '@/domain/users/User';
import type { CycleRunsPage } from '@/domain/circles/CycleRun';
import type {
  GuaranteeFund,
  Installment,
  InstallmentsPage,
  PayoutsPage,
} from '@/domain/finance/Finance';

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

export function person(overrides: Partial<UserDetail> = {}): UserDetail {
  sequence += 1;
  return {
    userId: `00000000-0000-4000-a000-${String(sequence).padStart(12, '0')}`,
    status: 'active',
    name: 'Rosa Q.',
    email: 'r***@mail.com',
    phone: '+51******321',
    preferredLanguage: 'es',
    createdAt: NOW,
    kyc: { national_id: 'approved', proof_of_income: 'in_review', additional: 'not_submitted' },
    circles: [],
    blocked: null,
    ...overrides,
  };
}

/**
 * Personas en memoria. `index` relaciona cada búsqueda exacta (email o teléfono completos, que el
 * doble sí conoce) con la persona; el id también se busca.
 */
export class InMemoryUsers implements UsersRepositoryPort {
  readonly searches: string[] = [];

  constructor(
    public people: UserDetail[] = [],
    private readonly index: Record<string, string> = {},
  ) {}

  search(query: string): Promise<UserSummary[]> {
    this.searches.push(query);
    const userId = this.index[query.toLowerCase()] ?? query;
    return Promise.resolve(
      this.people
        .filter((item) => item.userId === userId)
        .map((item) => ({
          userId: item.userId,
          status: item.status,
          name: item.name,
          email: item.email,
          phone: item.phone,
          preferredLanguage: item.preferredLanguage,
          createdAt: item.createdAt,
          blocked: item.blocked,
        })),
    );
  }

  get(userId: string): Promise<UserDetail> {
    const found = this.people.find((item) => item.userId === userId);
    return found
      ? Promise.resolve(structuredClone(found))
      : Promise.reject(new AppError('not_found', 'No existe', 'USER_NOT_FOUND'));
  }

  readonly actions: { userId: string; action: string; reason: string }[] = [];
  readonly noteBook: Record<string, SupportNote[]> = {};
  contact: UserContact = {
    email: 'rosa.quispe@mail.com',
    phone: '+51987654321',
    firstName: 'Rosa',
    lastName: 'Quispe',
  };

  revokeSessions(userId: string, reason: string): Promise<{ revokedSessions: number }> {
    this.actions.push({ userId, action: 'revoke', reason });
    return Promise.resolve({ revokedSessions: 2 });
  }

  setBlocked(userId: string, action: 'block' | 'unblock', reason: string): Promise<BlockResult> {
    this.actions.push({ userId, action, reason });
    const found = this.people.find((item) => item.userId === userId);
    const changed = action === 'block' ? found?.blocked === null : found?.blocked !== null;
    if (found) found.blocked = action === 'block' ? { at: NOW, reason } : null;
    return Promise.resolve({
      blocked: action === 'block',
      changed,
      revokedSessions: action === 'block' ? 1 : 0,
    });
  }

  revealContact(userId: string, reason: string): Promise<UserContact> {
    this.actions.push({ userId, action: 'reveal', reason });
    return Promise.resolve({ ...this.contact });
  }

  notes(userId: string): Promise<SupportNote[]> {
    return Promise.resolve(structuredClone(this.noteBook[userId] ?? []));
  }

  addNote(userId: string, body: string): Promise<SupportNote> {
    const note: SupportNote = {
      id: `00000000-0000-4000-d000-${String((this.noteBook[userId]?.length ?? 0) + 1).padStart(12, '0')}`,
      body,
      authorId: 'dev:soporte@ayni.local',
      authorEmail: 'soporte@ayni.local',
      createdAt: NOW,
    };
    this.noteBook[userId] = [note, ...(this.noteBook[userId] ?? [])];
    return Promise.resolve(structuredClone(note));
  }
}

export class InMemoryCycleRuns implements CycleRunsRepositoryPort {
  constructor(public page: CycleRunsPage = { items: [], nextCursor: null }) {}

  list(): Promise<CycleRunsPage> {
    return Promise.resolve(structuredClone(this.page));
  }
}

export function installment(overrides: Partial<Installment> = {}): Installment {
  sequence += 1;
  return {
    id: `00000000-0000-4000-b000-${String(sequence).padStart(12, '0')}`,
    circleId: '00000000-0000-4000-8000-000000000042',
    position: 2,
    period: '2026-12',
    dueOn: '2026-12-01',
    amount: { amount: 100_000, currency: 'PEN' },
    status: 'overdue',
    paidAt: null,
    member: { userId: '11111111-1111-4111-8111-111111111111', name: 'Lucía M.' },
    ...overrides,
  };
}

/** Finanzas en memoria: filtra cuotas como el backend y guarda los filtros pedidos. */
export class InMemoryFinance implements FinanceRepositoryPort {
  readonly requests: InstallmentsFilter[] = [];
  pageSize = 25;

  constructor(
    public installmentItems: Installment[] = [],
    public payoutPage: PayoutsPage = { items: [], nextCursor: null },
    public fund: GuaranteeFund = { balances: [], items: [], nextCursor: null },
  ) {}

  installments(filter: InstallmentsFilter): Promise<InstallmentsPage> {
    this.requests.push(filter);
    const matching = this.installmentItems.filter(
      (item) =>
        (!filter.status || item.status === filter.status) &&
        (!filter.period || item.period === filter.period),
    );
    const start = filter.cursor ? Number(filter.cursor) : 0;
    const next = start + this.pageSize;
    const totals = [...new Set(matching.map((item) => item.status))].map((status) => {
      const ofStatus = matching.filter((item) => item.status === status);
      return {
        status,
        count: ofStatus.length,
        total: {
          amount: ofStatus.reduce((sum, item) => sum + item.amount.amount, 0),
          currency: 'PEN',
        },
      };
    });
    return Promise.resolve({
      totals,
      items: structuredClone(matching.slice(start, next)),
      nextCursor: next < matching.length ? String(next) : null,
    });
  }

  payouts(): Promise<PayoutsPage> {
    return Promise.resolve(structuredClone(this.payoutPage));
  }

  guaranteeFund(): Promise<GuaranteeFund> {
    return Promise.resolve(structuredClone(this.fund));
  }
}
