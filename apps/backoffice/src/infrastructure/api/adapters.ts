import type { CircleDetail, CirclesPage, PauseAction, PauseResult } from '@/domain/circles/Circle';
import type {
  KycApproval,
  KycPageUrl,
  KycRejection,
  KycReviewDetail,
  KycReviewsPage,
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
  PageFilter,
  CycleRunsRepositoryPort,
  ApprovalsFilter,
  HelpRepositoryPort,
} from '@/domain/ports';
import type { HelpContent, HelpInput, HelpLanguage } from '@/domain/help/Help';
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
import type { GuaranteeFund, InstallmentsPage, PayoutsPage } from '@/domain/finance/Finance';
import type { Approval, ApprovalsPage, FundMovementProposal } from '@/domain/finance/Approval';
import type {
  PayoutAccount,
  PayoutAccountForm,
  PayoutAccounts,
} from '@/domain/payouts/PayoutAccount';

import type { HttpClientPort } from '../http/FetchHttpClient';
import type { TokenStore } from '../http/TokenStore';
import {
  circleDetailSchema,
  circlesPageSchema,
  devSessionSchema,
  kycPageUrlSchema,
  kycReviewDetailSchema,
  kycReviewsPageSchema,
  pauseResultSchema,
  staffMeSchema,
  userDetailSchema,
  usersSearchSchema,
  blockResultSchema,
  cycleRunsPageSchema,
  revokeSessionsSchema,
  supportNoteSchema,
  supportNotesSchema,
  userContactSchema,
  guaranteeFundSchema,
  installmentsPageSchema,
  payoutsPageSchema,
  payoutAccountSchema,
  payoutAccountsSchema,
  approvalSchema,
  approvalsPageSchema,
  helpContentSchema,
} from './schemas';

/**
 * Sesión con la identidad de desarrollo del backend (`POST /admin/v1/dev/sessions`): elige el
 * email y los roles. Solo existe con `STAFF_AUTH_PROVIDER=dev`.
 */
export class DevStaffAuth implements StaffAuthPort {
  constructor(
    private readonly http: HttpClientPort,
    private readonly tokens: TokenStore,
  ) {}

  async signIn(credentials: DevCredentials): Promise<StaffMember> {
    const session = await this.http.post('/admin/v1/dev/sessions', {
      schema: devSessionSchema,
      body: credentials,
      anonymous: true,
    });
    this.tokens.set(session.accessToken);
    const staff = await this.current();
    if (!staff) throw new AppError('unauthorized', 'No pudimos iniciar la sesión');
    return staff;
  }

  async current(signal?: AbortSignal): Promise<StaffMember | null> {
    if (!this.tokens.get()) return null;
    try {
      return await this.http.get('/admin/v1/me', { schema: staffMeSchema, signal });
    } catch (error) {
      if (error instanceof AppError && error.kind === 'unauthorized') {
        this.tokens.clear();
        return null;
      }
      throw error;
    }
  }

  signOut(): void {
    this.tokens.clear();
  }
}

export class CirclesApiRepository implements CirclesRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  list(filter: CirclesFilter, signal?: AbortSignal): Promise<CirclesPage> {
    const query = new URLSearchParams();
    if (filter.state) query.set('state', filter.state);
    if (filter.cursor) query.set('cursor', filter.cursor);
    if (filter.limit) query.set('limit', String(filter.limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    return this.http.get(`/admin/v1/circles${suffix}`, { schema: circlesPageSchema, signal });
  }

  get(circleId: string, signal?: AbortSignal): Promise<CircleDetail> {
    return this.http.get(`/admin/v1/circles/${encodeURIComponent(circleId)}`, {
      schema: circleDetailSchema,
      signal,
    });
  }

  setPause(circleId: string, action: PauseAction, reason: string): Promise<PauseResult> {
    return this.http.post(`/admin/v1/circles/${encodeURIComponent(circleId)}/${action}`, {
      schema: pauseResultSchema,
      body: { reason },
    });
  }
}

/** Revisión manual del KYC (docs/api/admin.md, "Revisión manual del KYC"). */
export class KycApiRepository implements KycRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  list(filter: KycFilter, signal?: AbortSignal): Promise<KycReviewsPage> {
    const query = new URLSearchParams({ status: filter.status });
    if (filter.type) query.set('type', filter.type);
    if (filter.cursor) query.set('cursor', filter.cursor);
    if (filter.limit) query.set('limit', String(filter.limit));
    return this.http.get(`/admin/v1/kyc/reviews?${query.toString()}`, {
      schema: kycReviewsPageSchema,
      signal,
    });
  }

  get(id: string, signal?: AbortSignal): Promise<KycReviewDetail> {
    return this.http.get(`/admin/v1/kyc/reviews/${encodeURIComponent(id)}`, {
      schema: kycReviewDetailSchema,
      signal,
    });
  }

  pageUrl(id: string, page: number): Promise<KycPageUrl> {
    return this.http.get(
      `/admin/v1/kyc/reviews/${encodeURIComponent(id)}/pages/${String(page)}/url`,
      { schema: kycPageUrlSchema },
    );
  }

  approve(id: string, approval: KycApproval): Promise<KycReviewDetail> {
    return this.http.post(`/admin/v1/kyc/reviews/${encodeURIComponent(id)}/approve`, {
      schema: kycReviewDetailSchema,
      body: approval,
    });
  }

  reject(id: string, rejection: KycRejection): Promise<KycReviewDetail> {
    return this.http.post(`/admin/v1/kyc/reviews/${encodeURIComponent(id)}/reject`, {
      schema: kycReviewDetailSchema,
      body: rejection,
    });
  }
}

export class UsersApiRepository implements UsersRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async search(query: string, signal?: AbortSignal): Promise<UserSummary[]> {
    const params = new URLSearchParams({ query });
    const page = await this.http.get(`/admin/v1/users?${params.toString()}`, {
      schema: usersSearchSchema,
      signal,
    });
    return page.items;
  }

  get(userId: string, signal?: AbortSignal): Promise<UserDetail> {
    return this.http.get(`/admin/v1/users/${encodeURIComponent(userId)}`, {
      schema: userDetailSchema,
      signal,
    });
  }

  revokeSessions(userId: string, reason: string): Promise<{ revokedSessions: number }> {
    return this.http.post(`/admin/v1/users/${encodeURIComponent(userId)}/sessions/revoke`, {
      schema: revokeSessionsSchema,
      body: { reason },
    });
  }

  setBlocked(userId: string, action: 'block' | 'unblock', reason: string): Promise<BlockResult> {
    return this.http.post(`/admin/v1/users/${encodeURIComponent(userId)}/${action}`, {
      schema: blockResultSchema,
      body: { reason },
    });
  }

  revealContact(userId: string, reason: string): Promise<UserContact> {
    return this.http.post(`/admin/v1/users/${encodeURIComponent(userId)}/pii/reveal`, {
      schema: userContactSchema,
      body: { reason },
    });
  }

  async notes(userId: string, signal?: AbortSignal): Promise<SupportNote[]> {
    const page = await this.http.get(`/admin/v1/users/${encodeURIComponent(userId)}/notes`, {
      schema: supportNotesSchema,
      signal,
    });
    return page.items;
  }

  addNote(userId: string, body: string): Promise<SupportNote> {
    return this.http.post(`/admin/v1/users/${encodeURIComponent(userId)}/notes`, {
      schema: supportNoteSchema,
      body: { body },
    });
  }

  payoutAccounts(userId: string, signal?: AbortSignal): Promise<PayoutAccounts> {
    return this.http.get(`/admin/v1/users/${encodeURIComponent(userId)}/payout-account`, {
      schema: payoutAccountsSchema,
      signal,
    });
  }

  registerPayoutAccount(
    userId: string,
    form: PayoutAccountForm,
    reason: string,
  ): Promise<PayoutAccount> {
    return this.http.put(`/admin/v1/users/${encodeURIComponent(userId)}/payout-account`, {
      schema: payoutAccountSchema,
      body: { ...form, reason },
    });
  }
}

function pageQuery(filter: PageFilter, extra: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(extra)) if (value) query.set(key, value);
  if (filter.cursor) query.set('cursor', filter.cursor);
  if (filter.limit) query.set('limit', String(filter.limit));
  return query.size > 0 ? `?${query.toString()}` : '';
}

export class FinanceApiRepository implements FinanceRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  installments(filter: InstallmentsFilter, signal?: AbortSignal): Promise<InstallmentsPage> {
    const query = pageQuery(filter, { status: filter.status, period: filter.period });
    return this.http.get(`/admin/v1/finance/installments${query}`, {
      schema: installmentsPageSchema,
      signal,
    });
  }

  payouts(filter: PageFilter, signal?: AbortSignal): Promise<PayoutsPage> {
    return this.http.get(`/admin/v1/finance/payouts${pageQuery(filter)}`, {
      schema: payoutsPageSchema,
      signal,
    });
  }

  guaranteeFund(filter: PageFilter, signal?: AbortSignal): Promise<GuaranteeFund> {
    return this.http.get(`/admin/v1/finance/guarantee-fund${pageQuery(filter)}`, {
      schema: guaranteeFundSchema,
      signal,
    });
  }

  approvals(filter: ApprovalsFilter, signal?: AbortSignal): Promise<ApprovalsPage> {
    return this.http.get(`/admin/v1/approvals${pageQuery(filter, { status: filter.status })}`, {
      schema: approvalsPageSchema,
      signal,
    });
  }

  proposeFundMovement(proposal: FundMovementProposal): Promise<Approval> {
    return this.http.post('/admin/v1/guarantee-fund/movements', {
      schema: approvalSchema,
      body: proposal,
    });
  }

  approve(approvalId: string): Promise<Approval> {
    return this.http.post(`/admin/v1/approvals/${encodeURIComponent(approvalId)}/approve`, {
      schema: approvalSchema,
      body: {},
    });
  }

  reject(approvalId: string, reason: string): Promise<Approval> {
    return this.http.post(`/admin/v1/approvals/${encodeURIComponent(approvalId)}/reject`, {
      schema: approvalSchema,
      body: { reason },
    });
  }
}

export class HelpApiRepository implements HelpRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  get(language: HelpLanguage, signal?: AbortSignal): Promise<HelpContent> {
    return this.http.get(`/admin/v1/help/${language}`, { schema: helpContentSchema, signal });
  }

  save(language: HelpLanguage, input: HelpInput): Promise<HelpContent> {
    return this.http.put(`/admin/v1/help/${language}`, {
      schema: helpContentSchema,
      body: input,
    });
  }
}

export class CycleRunsApiRepository implements CycleRunsRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  list(filter: PageFilter, signal?: AbortSignal): Promise<CycleRunsPage> {
    return this.http.get(`/admin/v1/cycle-runs${pageQuery(filter)}`, {
      schema: cycleRunsPageSchema,
      signal,
    });
  }
}
