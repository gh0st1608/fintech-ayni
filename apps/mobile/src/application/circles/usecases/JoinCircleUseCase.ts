import { type JoinCircleDraft, joinRequestFingerprint } from '@/domain/circles/JoinCircleDraft';
import {
  type JoinedCircle,
  MemberBlockedError,
  MonthlyLimitExceededError,
  NationalIdRequiredError,
  PayoutMethodLimitExceededError,
  PayoutMethodRequiredError,
} from '@/domain/circles/JoinedCircle';
import type { CircleMembershipRepositoryPort } from '@/domain/circles/ports/CircleMembershipRepositoryPort';
import {
  SlotNoLongerAvailableError,
  SlotNotAllowedError,
} from '@/domain/circles/value-objects/Slot';
import { AppError } from '@/domain/shared/errors/AppError';
import type { DomainError } from '@/domain/shared/errors/DomainError';
import type { IdGeneratorPort } from '@/domain/shared/ports/IdGeneratorPort';
import { Money } from '@/domain/shared/value-objects/Money';

/** Rechazos del backend que la pantalla resuelve con una acción concreta. */
const TYPED_ERRORS: Record<string, new (message: string) => DomainError> = {
  NATIONAL_ID_REQUIRED: NationalIdRequiredError,
  MONTHLY_LIMIT_EXCEEDED: MonthlyLimitExceededError,
  PAYOUT_METHOD_REQUIRED: PayoutMethodRequiredError,
  PAYOUT_METHOD_LIMIT_EXCEEDED: PayoutMethodLimitExceededError,
  // El turno ya no se puede tomar: hay que elegir otro en el paso 3, que vuelve a pedir los slots.
  SLOT_TAKEN: SlotNoLongerAvailableError,
  ALREADY_MEMBER: SlotNoLongerAvailableError,
  CIRCLE_ALREADY_STARTED: SlotNoLongerAvailableError,
  // La regla de confianza no le permite ese tipo de turno (COPAYNI-60): elige otro.
  SLOT_NOT_ALLOWED: SlotNotAllowedError,
  // La vacante de un círculo en curso ya no se puede tomar (COPAYNI-59).
  VACANCY_CLOSED: SlotNoLongerAvailableError,
  CIRCLE_NOT_FOUND: SlotNoLongerAvailableError,
};

/** Lo que debe el expulsado: el backend lo manda en los detalles del error, en unidades menores. */
function amountDue(error: AppError): Money | null {
  const { amountDue: amount, currency } = error.fieldErrors ?? {};
  if (!amount || !/^\d+$/.test(amount) || !currency) return null;
  try {
    return Money.of(Number(amount), currency);
  } catch {
    return null;
  }
}

/**
 * Confirma la unión del borrador (COPAYNI-31). La Idempotency-Key se genera una vez por pedido
 * (círculo, payout, duración y slot) y se repite en los reintentos, también si el usuario vuelve
 * atrás sin cambiar nada: si una respuesta se perdió, el backend devuelve la misma unión en vez
 * de crear otra. Cambiar el pedido genera una clave nueva.
 */
export class JoinCircleUseCase {
  private current: { fingerprint: string; key: string } | null = null;

  constructor(
    private readonly repository: CircleMembershipRepositoryPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  async execute(draft: JoinCircleDraft): Promise<JoinedCircle> {
    const request = draft.joinRequest();
    try {
      return await this.repository.join(request, this.keyFor(joinRequestFingerprint(request)));
    } catch (error) {
      if (error instanceof AppError && error.code === 'MEMBER_BLOCKED') {
        throw new MemberBlockedError('Join rejected: MEMBER_BLOCKED', amountDue(error));
      }
      const TypedError = error instanceof AppError ? TYPED_ERRORS[error.code ?? ''] : undefined;
      if (TypedError) throw new TypedError(`Join rejected: ${(error as AppError).code}`);
      throw error;
    }
  }

  private keyFor(fingerprint: string): string {
    if (this.current?.fingerprint !== fingerprint) {
      this.current = { fingerprint, key: this.ids.next() };
    }
    return this.current.key;
  }
}
