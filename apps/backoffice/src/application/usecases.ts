import type { CircleDetail, CirclesPage, PauseAction, PauseResult } from '@/domain/circles/Circle';
import {
  type KycApproval,
  type KycPageUrl,
  type KycRejection,
  type KycReviewDetail,
  type KycReviewsPage,
  REJECTION_REASON_CODES,
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
} from '@/domain/ports';
import { AppError } from '@/domain/shared/AppError';
import { can, type StaffMember } from '@/domain/staff/Staff';
import {
  type BlockResult,
  isExactUserQuery,
  MAX_NOTE_LENGTH,
  type SupportNote,
  type UserContact,
  type UserDetail,
  type UserSummary,
} from '@/domain/users/User';
import type { CycleRunsPage } from '@/domain/circles/CycleRun';
import {
  isValidCci,
  isValidWalletPhone,
  onlyDigits,
  type PayoutAccount,
  type PayoutAccountForm,
  type PayoutAccounts,
} from '@/domain/payouts/PayoutAccount';
import {
  type GuaranteeFund,
  type InstallmentsPage,
  isPeriod,
  type PayoutsPage,
} from '@/domain/finance/Finance';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** El backend acepta motivos de hasta 500 caracteres. */
export const MAX_REASON_LENGTH = 500;

export class SignInUseCase {
  constructor(private readonly auth: StaffAuthPort) {}

  execute(credentials: DevCredentials): Promise<StaffMember> {
    const email = credentials.email.trim().toLowerCase();
    if (!EMAIL.test(email)) throw new AppError('validation', 'Ingresa un email válido');
    if (credentials.roles.length === 0) throw new AppError('validation', 'Elige al menos un rol');
    return this.auth.signIn({ email, roles: credentials.roles });
  }
}

export class GetCurrentStaffUseCase {
  constructor(private readonly auth: StaffAuthPort) {}

  execute(signal?: AbortSignal): Promise<StaffMember | null> {
    return this.auth.current(signal);
  }
}

export class SignOutUseCase {
  constructor(private readonly auth: StaffAuthPort) {}

  execute(): void {
    this.auth.signOut();
  }
}

export class ListCirclesUseCase {
  constructor(private readonly circles: CirclesRepositoryPort) {}

  execute(filter: CirclesFilter, signal?: AbortSignal): Promise<CirclesPage> {
    return this.circles.list(filter, signal);
  }
}

export class GetCircleUseCase {
  constructor(private readonly circles: CirclesRepositoryPort) {}

  execute(circleId: string, signal?: AbortSignal): Promise<CircleDetail> {
    return this.circles.get(circleId, signal);
  }
}

/**
 * Pausa o reanuda una junta (COPAYNI-61). Solo el admin general, con motivo obligatorio; el
 * backend además exige una autenticación reciente y lo audita.
 */
export class SetCirclePauseUseCase {
  constructor(private readonly circles: CirclesRepositoryPort) {}

  execute(
    staff: StaffMember,
    circleId: string,
    action: PauseAction,
    reason: string,
  ): Promise<PauseResult> {
    if (!can(staff, 'circles.pause')) {
      throw new AppError('forbidden', 'Solo el admin general puede pausar o reanudar juntas');
    }
    const trimmed = reason.trim();
    if (!trimmed) throw new AppError('validation', 'Escribe el motivo');
    if (trimmed.length > MAX_REASON_LENGTH) {
      throw new AppError('validation', `El motivo admite hasta ${MAX_REASON_LENGTH} caracteres`);
    }
    return this.circles.setPause(circleId, action, trimmed);
  }
}

/** Nota interna opcional de la revisión: solo queda en la auditoría del backend. */
function cleanNote(note: string | undefined): string | undefined {
  const trimmed = note?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_REASON_LENGTH) {
    throw new AppError('validation', `La nota admite hasta ${MAX_REASON_LENGTH} caracteres`);
  }
  return trimmed;
}

function assertReviewer(staff: StaffMember): void {
  if (!can(staff, 'kyc.review')) {
    throw new AppError('forbidden', 'Solo operaciones y el admin general revisan documentos');
  }
}

export class ListKycReviewsUseCase {
  constructor(private readonly kyc: KycRepositoryPort) {}

  execute(filter: KycFilter, signal?: AbortSignal): Promise<KycReviewsPage> {
    return this.kyc.list(filter, signal);
  }
}

export class GetKycReviewUseCase {
  constructor(private readonly kyc: KycRepositoryPort) {}

  execute(id: string, signal?: AbortSignal): Promise<KycReviewDetail> {
    return this.kyc.get(id, signal);
  }
}

/** Pide la URL de 60 s de una página. Cada pedido queda en la auditoría del backend. */
export class GetKycPageUrlUseCase {
  constructor(private readonly kyc: KycRepositoryPort) {}

  execute(staff: StaffMember, id: string, page: number): Promise<KycPageUrl> {
    assertReviewer(staff);
    return this.kyc.pageUrl(id, page);
  }
}

/**
 * Aprueba un documento en revisión. En un comprobante de ingresos se puede corregir el ingreso con
 * el que figura en el documento; el límite mensual de la persona sale de ese valor.
 */
export class ApproveKycUseCase {
  constructor(private readonly kyc: KycRepositoryPort) {}

  execute(staff: StaffMember, id: string, approval: KycApproval): Promise<KycReviewDetail> {
    assertReviewer(staff);
    const { monthlyIncome } = approval;
    if (
      monthlyIncome !== undefined &&
      (!Number.isSafeInteger(monthlyIncome) || monthlyIncome <= 0)
    ) {
      throw new AppError('validation', 'El ingreso debe ser mayor que 0');
    }
    const note = cleanNote(approval.note);
    return this.kyc.approve(id, {
      ...(monthlyIncome !== undefined && { monthlyIncome }),
      ...(note && { note }),
    });
  }
}

/** Rechaza con un motivo del catálogo: es el texto que verá la persona para corregir. */
export class RejectKycUseCase {
  constructor(private readonly kyc: KycRepositoryPort) {}

  execute(staff: StaffMember, id: string, rejection: KycRejection): Promise<KycReviewDetail> {
    assertReviewer(staff);
    if (!REJECTION_REASON_CODES.includes(rejection.reason)) {
      throw new AppError('validation', 'Elige el motivo del rechazo');
    }
    const note = cleanNote(rejection.note);
    return this.kyc.reject(id, { reason: rejection.reason, ...(note && { note }) });
  }
}

/**
 * Busca una persona por email completo, teléfono con código de país o id. El backend no busca por
 * partes y audita cada búsqueda.
 */
export class SearchUsersUseCase {
  constructor(private readonly users: UsersRepositoryPort) {}

  execute(query: string, signal?: AbortSignal): Promise<UserSummary[]> {
    const trimmed = query.trim();
    if (!isExactUserQuery(trimmed)) {
      throw new AppError(
        'validation',
        'Escribe el email completo, el teléfono con código de país (+51…) o el id',
      );
    }
    return this.users.search(trimmed, signal);
  }
}

export class GetUserUseCase {
  constructor(private readonly users: UsersRepositoryPort) {}

  execute(userId: string, signal?: AbortSignal): Promise<UserDetail> {
    return this.users.get(userId, signal);
  }
}

/** Cuotas por estado y mes. El mes, si viene, va como `AAAA-MM`. */
export class ListInstallmentsUseCase {
  constructor(private readonly finance: FinanceRepositoryPort) {}

  execute(filter: InstallmentsFilter, signal?: AbortSignal): Promise<InstallmentsPage> {
    if (filter.period !== undefined && !isPeriod(filter.period)) {
      throw new AppError('validation', 'El mes debe tener la forma AAAA-MM');
    }
    return this.finance.installments(filter, signal);
  }
}

export class ListPayoutsUseCase {
  constructor(private readonly finance: FinanceRepositoryPort) {}

  execute(filter: PageFilter, signal?: AbortSignal): Promise<PayoutsPage> {
    return this.finance.payouts(filter, signal);
  }
}

export class GetGuaranteeFundUseCase {
  constructor(private readonly finance: FinanceRepositoryPort) {}

  execute(filter: PageFilter, signal?: AbortSignal): Promise<GuaranteeFund> {
    return this.finance.guaranteeFund(filter, signal);
  }
}

/** Motivo obligatorio de una acción de soporte: queda en la auditoría del backend. */
function cleanReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) throw new AppError('validation', 'Escribe el motivo');
  if (trimmed.length > MAX_REASON_LENGTH) {
    throw new AppError('validation', `El motivo admite hasta ${MAX_REASON_LENGTH} caracteres`);
  }
  return trimmed;
}

function assertCan(
  staff: StaffMember,
  permission: 'users.support' | 'users.reveal' | 'payouts.register',
): void {
  if (!can(staff, permission)) throw new AppError('forbidden', 'Tu rol no permite esta acción');
}

/** Cierra las sesiones de la persona (p. ej. por un teléfono robado). Puede volver a entrar. */
export class RevokeUserSessionsUseCase {
  constructor(private readonly users: UsersRepositoryPort) {}

  execute(
    staff: StaffMember,
    userId: string,
    reason: string,
  ): Promise<{ revokedSessions: number }> {
    assertCan(staff, 'users.support');
    return this.users.revokeSessions(userId, cleanReason(reason));
  }
}

/** Bloquea (cierra sus sesiones y no puede volver a entrar) o desbloquea. Desbloquear exige step-up. */
export class SetUserBlockedUseCase {
  constructor(private readonly users: UsersRepositoryPort) {}

  execute(
    staff: StaffMember,
    userId: string,
    action: 'block' | 'unblock',
    reason: string,
  ): Promise<BlockResult> {
    assertCan(staff, 'users.support');
    return this.users.setBlocked(userId, action, cleanReason(reason));
  }
}

/** Revela el dato completo. Solo operaciones y el admin general; el backend lo audita. */
export class RevealUserContactUseCase {
  constructor(private readonly users: UsersRepositoryPort) {}

  execute(staff: StaffMember, userId: string, reason: string): Promise<UserContact> {
    assertCan(staff, 'users.reveal');
    return this.users.revealContact(userId, cleanReason(reason));
  }
}

export class ListSupportNotesUseCase {
  constructor(private readonly users: UsersRepositoryPort) {}

  execute(userId: string, signal?: AbortSignal): Promise<SupportNote[]> {
    return this.users.notes(userId, signal);
  }
}

/** Agrega una nota al historial de atención. Las notas no se editan ni se borran. */
export class AddSupportNoteUseCase {
  constructor(private readonly users: UsersRepositoryPort) {}

  execute(staff: StaffMember, userId: string, body: string): Promise<SupportNote> {
    assertCan(staff, 'users.support');
    const trimmed = body.trim();
    if (!trimmed) throw new AppError('validation', 'Escribe la nota');
    if (trimmed.length > MAX_NOTE_LENGTH) {
      throw new AppError('validation', `La nota admite hasta ${MAX_NOTE_LENGTH} caracteres`);
    }
    return this.users.addNote(userId, trimmed);
  }
}

export class GetPayoutAccountsUseCase {
  constructor(private readonly users: UsersRepositoryPort) {}

  execute(userId: string, signal?: AbortSignal): Promise<PayoutAccounts> {
    return this.users.payoutAccounts(userId, signal);
  }
}

/**
 * Registra la cuenta de cobro (COPAYNI-81): solo Operaciones y el admin general, con motivo. Valida
 * el CCI o el celular antes de enviar; el backend comprueba además el titular y el mes de cobro.
 */
export class RegisterPayoutAccountUseCase {
  constructor(private readonly users: UsersRepositoryPort) {}

  execute(
    staff: StaffMember,
    userId: string,
    form: PayoutAccountForm,
    reason: string,
  ): Promise<PayoutAccount> {
    assertCan(staff, 'payouts.register');
    const holderName = form.holderName.trim().replace(/\s+/g, ' ');
    if (holderName.split(' ').length < 2) {
      throw new AppError('validation', 'Escribe el nombre completo del titular');
    }
    if (form.kind === 'bank_account') {
      if (!form.bankCode) throw new AppError('validation', 'Elige el banco');
      const cci = onlyDigits(form.cci);
      if (!isValidCci(cci)) {
        throw new AppError('validation', 'El CCI no es válido: revisa los 20 dígitos');
      }
      if (!cci.startsWith(form.bankCode)) {
        throw new AppError('validation', 'El CCI no es del banco elegido');
      }
      return this.users.registerPayoutAccount(
        userId,
        { ...form, cci, holderName },
        cleanReason(reason),
      );
    }
    if (!isValidWalletPhone(form.phone)) {
      throw new AppError('validation', 'El celular debe tener 9 dígitos y empezar con 9');
    }
    return this.users.registerPayoutAccount(
      userId,
      { ...form, phone: onlyDigits(form.phone), holderName },
      cleanReason(reason),
    );
  }
}

export class ListCycleRunsUseCase {
  constructor(private readonly runs: CycleRunsRepositoryPort) {}

  execute(filter: PageFilter, signal?: AbortSignal): Promise<CycleRunsPage> {
    return this.runs.list(filter, signal);
  }
}
