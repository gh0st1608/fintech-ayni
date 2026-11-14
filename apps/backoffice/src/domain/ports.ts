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
import type { HelpContent, HelpInput, HelpLanguage } from './help/Help';
import type { DelinquencyPage, DelinquencyView } from './finance/Delinquency';
import type {
  Approval,
  ApprovalsPage,
  ApprovalStatus,
  FundMovementProposal,
} from './finance/Approval';
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
 * - Dev: `signIn(credentials)` intercambia credenciales por un token del backend.
 * - OIDC: `initiateFlow()` inicia el flujo PKCE (redirige, no retorna); `handleCallback()` completa
 *   el intercambio del código tras la redirección de vuelta.
 */
export interface StaffAuthPort {
  signIn(credentials: DevCredentials): Promise<StaffMember>;
  /** Solo modo OIDC: inicia el flujo PKCE hacia el proveedor (redirige el navegador). */
  initiateFlow?(returnTo?: string): void;
  /** Solo modo OIDC: intercambia el código recibido del proveedor por un token de staff. */
  handleCallback?(code: string, state: string): Promise<StaffMember>;
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
  /** Propuestas de doble aprobación (COPAYNI-73). */
  approvals(filter: ApprovalsFilter, signal?: AbortSignal): Promise<ApprovalsPage>;
  proposeFundMovement(proposal: FundMovementProposal): Promise<Approval>;
  /** El backend exige autenticación reciente y que decida otra persona. */
  approve(approvalId: string): Promise<Approval>;
  reject(approvalId: string, reason: string): Promise<Approval>;
  /** Mora, solo lectura (COPAYNI-94). */
  delinquency(filter: DelinquencyFilter, signal?: AbortSignal): Promise<DelinquencyPage>;
}

export interface DelinquencyFilter extends PageFilter {
  view: DelinquencyView;
}

export interface ApprovalsFilter extends PageFilter {
  status?: ApprovalStatus;
}

/** Ayuda de la app (docs/api/admin.md, "Ayuda"). */
export interface HelpRepositoryPort {
  get(language: HelpLanguage, signal?: AbortSignal): Promise<HelpContent>;
  /** Reemplaza todo el contenido del idioma; se publica al instante. */
  save(language: HelpLanguage, input: HelpInput): Promise<HelpContent>;
}

/** Ejecuciones de la tarea diaria del ciclo mensual (docs/api/admin.md). */
export interface CycleRunsRepositoryPort {
  list(filter: PageFilter, signal?: AbortSignal): Promise<CycleRunsPage>;
}
