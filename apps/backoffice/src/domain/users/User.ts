import type { CycleState, Money } from '../circles/Circle';
import type { KycType } from '../kyc/Kyc';

export const USER_STATUSES = ['pending_verification', 'active'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Estado del último documento de cada tipo, como lo resume el backend. */
export const KYC_DOCUMENT_STATES = ['not_submitted', 'in_review', 'approved', 'rejected'] as const;
export type KycDocumentState = (typeof KYC_DOCUMENT_STATES)[number];

/** Persona con sus datos personales ya enmascarados por el backend. */
export interface UserSummary {
  userId: string;
  status: UserStatus;
  name: string | null;
  email: string | null;
  phone: string | null;
  preferredLanguage: string | null;
  createdAt: Date;
}

export interface UserCircle {
  circleId: string;
  state: CycleState;
  payout: Money;
  months: number;
  position: number;
  joinedAt: Date;
  expelledAt: Date | null;
}

export interface UserDetail extends UserSummary {
  kyc: Record<KycType, KycDocumentState>;
  circles: UserCircle[];
}

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  pending_verification: 'Sin verificar',
  active: 'Activa',
};

export const KYC_DOCUMENT_STATE_LABELS: Record<KycDocumentState, string> = {
  not_submitted: 'No enviado',
  in_review: 'En revisión',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+[1-9]\d{7,14}$/;

/**
 * La búsqueda es exacta (el backend no busca por partes): un email completo, un teléfono con código
 * de país o un id. Validarlo aquí evita una ida al servidor y explica qué escribir.
 */
export function isExactUserQuery(query: string): boolean {
  const value = query.trim();
  return UUID.test(value) || EMAIL.test(value) || PHONE.test(value.replace(/[\s-]/g, ''));
}
