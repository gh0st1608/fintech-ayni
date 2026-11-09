import { ConflictError, DomainError, ValidationError } from '../../../shared/errors/app-error';

/** Para qué se sube un archivo (COPAYNI-43). */
export const UPLOAD_PURPOSES = [
  'national_id_front',
  'national_id_back',
  'proof_of_income',
  'additional',
] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

/** Tipos de documento del Perfil (Figma My Documents). */
export const DOCUMENT_TYPES = ['national_id', 'proof_of_income', 'additional'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Comprobante de ingresos (COPAYNI-48) y documentos adicionales (COPAYNI-49). */
export const DOCUMENT_KINDS = {
  national_id: ['national_id'],
  proof_of_income: ['hr_letter', 'bank_statement'],
  additional: ['utility_bill', 'driver_license', 'other'],
} as const satisfies Record<DocumentType, readonly string[]>;

export const DOCUMENT_STATUSES = ['in_review', 'approved', 'rejected'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** Imágenes de la cámara o un PDF (el extracto bancario puede venir en PDF, pregunta de 48). */
export const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Páginas de un comprobante de varias páginas (p. ej. 3 meses de extracto). */
export const MAX_PAGES = 10;

export class InvalidUploadError extends ValidationError {
  constructor(field: 'contentType' | 'sizeBytes') {
    super('El archivo no es válido', { [field]: 'invalid' });
  }
}

/** La subida no existe, no es del usuario, venció, ya se usó o no se completó. */
export class UploadNotUsableError extends DomainError {
  constructor(uploadId: string) {
    super('UPLOAD_NOT_USABLE', 'Una de las subidas no se puede usar', { uploadId });
  }
}

export function assertUploadable(contentType: string, sizeBytes: number): void {
  if (!(ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw new InvalidUploadError('contentType');
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_UPLOAD_BYTES) {
    throw new InvalidUploadError('sizeBytes');
  }
}

/**
 * Motivos de rechazo de la revisión manual (docs/backoffice-plan.md, fase 2). El personal elige un
 * código y la app muestra este texto para que la persona corrija y reenvíe: nadie escribe texto
 * libre que llegue al usuario. Provisional hasta que UX y Legal revisen los textos.
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

/** La revisión ya la resolvió otra persona: no se pisa su decisión. */
export class KycAlreadyReviewedError extends ConflictError {
  constructor(status: DocumentStatus) {
    super('KYC_ALREADY_REVIEWED', 'Este documento ya fue revisado', { status });
  }
}

/** El ajuste del ingreso solo aplica al comprobante de ingresos. */
export class IncomeAdjustmentNotAllowedError extends DomainError {
  constructor() {
    super('INCOME_ADJUSTMENT_NOT_ALLOWED', 'Solo el comprobante de ingresos tiene un ingreso');
  }
}
