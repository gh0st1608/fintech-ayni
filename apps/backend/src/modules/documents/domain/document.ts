import { DomainError, ValidationError } from '../../../shared/errors/app-error';

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
