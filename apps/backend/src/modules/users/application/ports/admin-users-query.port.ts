import { type Money } from '../../../../shared/domain/value-objects/money';
import { type UserStatus } from '../../domain/entities/user';

export const ADMIN_USERS_QUERY = Symbol('ADMIN_USERS_QUERY');

/** Criterio de búsqueda exacto: nunca parcial, para no recorrer la base con datos personales. */
export type AdminUserLookup =
  { by: 'id'; value: string } | { by: 'email'; value: string } | { by: 'phone'; value: string };

/** Datos de la persona tal como se guardan; la aplicación los enmascara antes de exponerlos. */
export interface AdminUserRecord {
  userId: string;
  status: UserStatus;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  preferredLanguage: string | null;
  createdAt: Date;
  /** Bloqueo puesto por el personal: sin él, `null`. El motivo es interno. */
  blocked: { at: Date; reason: string } | null;
}

/** Estado del último documento de cada tipo, como el resumen de `GET /v1/me/documents`. */
export type KycDocumentState = 'not_submitted' | 'in_review' | 'approved' | 'rejected';

export interface AdminUserCircle {
  circleId: string;
  state: string;
  payout: Money;
  months: number;
  position: number;
  joinedAt: Date;
  expelledAt: Date | null;
}

export interface AdminUserDetail extends AdminUserRecord {
  kyc: Record<'national_id' | 'proof_of_income' | 'additional', KycDocumentState>;
  circles: AdminUserCircle[];
}

export interface AdminUsersQueryPort {
  search(lookup: AdminUserLookup): Promise<AdminUserRecord[]>;
  find(userId: string): Promise<AdminUserDetail | null>;
}
