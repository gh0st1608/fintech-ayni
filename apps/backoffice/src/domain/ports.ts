import type {
  CircleDetail,
  CirclesPage,
  CycleState,
  PauseAction,
  PauseResult,
} from './circles/Circle';
import type {
  KycApproval,
  KycPageUrl,
  KycRejection,
  KycReviewDetail,
  KycReviewsPage,
  KycStatus,
  KycType,
} from './kyc/Kyc';
import type { StaffMember, StaffRole } from './staff/Staff';
import type { BlockResult, SupportNote, UserContact, UserDetail, UserSummary } from './users/User';
import type { CycleRunsPage } from './circles/CycleRun';
import type { PayoutAccount, PayoutAccountForm, PayoutAccounts } from './payouts/PayoutAccount';
import type {
  GuaranteeFund,
  InstallmentsPage,
  InstallmentStatus,
  PayoutsPage,
} from './finance/Finance';

/** Credenciales del inicio de sesión de desarrollo (`STAFF_AUTH_PROVIDER=dev` en el backend). */
export interface DevCredentials {
  email: string;
  roles: StaffRole[];
}

/**
 * Sesión del personal. El token vive solo en memoria: nunca en LocalStorage (base técnica §11).
 * El modo OIDC (Cognito, BO2) implementará este mismo puerto.
 */
export interface StaffAuthPort {
  signIn(credentials: DevCredentials): Promise<StaffMember>;
  current(signal?: AbortSignal): Promise<StaffMember | null>;
  signOut(): void;
}

export interface CirclesFilter {
  state?: CycleState;
  cursor?: string | null;
  limit?: number;
}

export interface CirclesRepositoryPort {
  list(filter: CirclesFilter, signal?: AbortSignal): Promise<CirclesPage>;
  get(circleId: string, signal?: AbortSignal): Promise<CircleDetail>;
  setPause(circleId: string, action: PauseAction, reason: string): Promise<PauseResult>;
}

export interface KycFilter {
  status: KycStatus;
  type?: KycType;
  cursor?: string | null;
  limit?: number;
}

export interface KycRepositoryPort {
  list(filter: KycFilter, signal?: AbortSignal): Promise<KycReviewsPage>;
  get(id: string, signal?: AbortSignal): Promise<KycReviewDetail>;
  /** URL de 60 s para ver una página; el backend lo audita. */
  pageUrl(id: string, page: number): Promise<KycPageUrl>;
  approve(id: string, approval: KycApproval): Promise<KycReviewDetail>;
  reject(id: string, rejection: KycRejection): Promise<KycReviewDetail>;
}

/** Búsqueda exacta de personas para soporte (docs/api/admin.md, "Búsqueda de personas"). */
export interface UsersRepositoryPort {
  search(query: string, signal?: AbortSignal): Promise<UserSummary[]>;
  get(userId: string, signal?: AbortSignal): Promise<UserDetail>;
  revokeSessions(userId: string, reason: string): Promise<{ revokedSessions: number }>;
  setBlocked(userId: string, action: 'block' | 'unblock', reason: string): Promise<BlockResult>;
  /** El dato completo: el backend exige motivo, autenticación reciente y lo audita. */
  revealContact(userId: string, reason: string): Promise<UserContact>;
  notes(userId: string, signal?: AbortSignal): Promise<SupportNote[]>;
  addNote(userId: string, body: string): Promise<SupportNote>;
  /** La cuenta de cobro vigente y las anteriores, enmascaradas (COPAYNI-81). */
  payoutAccounts(userId: string, signal?: AbortSignal): Promise<PayoutAccounts>;
  /** Registra la cuenta: el backend exige motivo, autenticación reciente y lo audita. */
  registerPayoutAccount(
    userId: string,
    form: PayoutAccountForm,
    reason: string,
  ): Promise<PayoutAccount>;
}

export interface PageFilter {
  cursor?: string | null;
  limit?: number;
}

export interface InstallmentsFilter extends PageFilter {
  status?: InstallmentStatus;
  /** `YYYY-MM`. */
  period?: string;
}

/** Finanzas, solo lectura (docs/api/admin.md, "Finanzas"). */
export interface FinanceRepositoryPort {
  installments(filter: InstallmentsFilter, signal?: AbortSignal): Promise<InstallmentsPage>;
  payouts(filter: PageFilter, signal?: AbortSignal): Promise<PayoutsPage>;
  guaranteeFund(filter: PageFilter, signal?: AbortSignal): Promise<GuaranteeFund>;
}

/** Ejecuciones de la tarea diaria del ciclo mensual (docs/api/admin.md). */
export interface CycleRunsRepositoryPort {
  list(filter: PageFilter, signal?: AbortSignal): Promise<CycleRunsPage>;
}
