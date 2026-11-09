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
} from '@/domain/ports';
import { AppError } from '@/domain/shared/AppError';
import { can, type StaffMember } from '@/domain/staff/Staff';

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
