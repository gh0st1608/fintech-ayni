import type { Money } from '../circles/Circle';

/** Estados y tipos de documento, como los define el backend (docs/api/documents.md). */
export const KYC_STATUSES = ['in_review', 'approved', 'rejected'] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export const KYC_TYPES = ['national_id', 'proof_of_income', 'additional'] as const;
export type KycType = (typeof KYC_TYPES)[number];

/**
 * Motivos de rechazo (docs/api/admin.md). La persona ve en la app el texto del motivo elegido; el
 * personal no escribe texto que le llegue. Mismo catálogo que el backend.
 */
export const REJECTION_REASONS = {
  illegible: 'El documento no se pudo leer: vuelve a escanearlo',
  incomplete: 'Faltan páginas o partes del documento: vuelve a subirlo completo',
  expired: 'El documento está vencido: sube uno vigente',
  data_mismatch: 'Los datos del documento no coinciden con los de tu perfil',
  not_recent: 'El comprobante no es reciente: sube uno de los últimos 3 meses',
  income_mismatch: 'El ingreso declarado no coincide con el comprobante',
  wrong_document: 'El archivo no corresponde al documento pedido',
} as const;
export type RejectionReason = keyof typeof REJECTION_REASONS;
export const REJECTION_REASON_CODES = Object.keys(REJECTION_REASONS) as RejectionReason[];

/** La persona, con sus datos personales ya enmascarados por el backend. */
export interface KycSubject {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface KycReviewSummary {
  id: string;
  type: KycType;
  kind: string;
  status: KycStatus;
  pages: number;
  monthlyIncome: Money | null;
  submittedAt: Date;
  /** La persona envió después otro documento del mismo tipo. */
  superseded: boolean;
  subject: KycSubject;
}

export interface KycReviewsPage {
  items: KycReviewSummary[];
  nextCursor: string | null;
}

export interface KycPageFile {
  page: number;
  purpose: string;
  sizeBytes: number;
}

export interface KycReviewDetail extends KycReviewSummary {
  reason: string | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  pageFiles: KycPageFile[];
}

export interface KycPageUrl {
  url: string;
  expiresAt: Date;
}

export interface KycApproval {
  /** Solo comprobante de ingresos: el ingreso del documento, en unidades menores. */
  monthlyIncome?: number;
  note?: string;
}

export interface KycRejection {
  reason: RejectionReason;
  note?: string;
}

export const KYC_TYPE_LABELS: Record<KycType, string> = {
  national_id: 'Documento de identidad',
  proof_of_income: 'Comprobante de ingresos',
  additional: 'Documento adicional',
};

export const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  in_review: 'En revisión',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

/** Etiquetas de `kind` y de las páginas; un valor que esta versión no conoce se muestra tal cual. */
export const KYC_KIND_LABELS: Record<string, string> = {
  national_id: 'DNI',
  hr_letter: 'Carta de RR. HH.',
  bank_statement: 'Extracto bancario',
  utility_bill: 'Recibo de servicios',
  driver_license: 'Licencia de conducir',
  other: 'Otro',
};

export const KYC_PURPOSE_LABELS: Record<string, string> = {
  national_id_front: 'Frente',
  national_id_back: 'Reverso',
  proof_of_income: 'Comprobante',
  additional: 'Adicional',
};
