import type { CircleDetail, CirclesPage, PauseAction, PauseResult } from '@/domain/circles/Circle';
import type {
  CirclesFilter,
  CirclesRepositoryPort,
  DevCredentials,
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
