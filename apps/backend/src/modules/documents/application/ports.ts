import { type Money } from '../../../shared/domain/value-objects/money';
import { type DocumentStatus, type DocumentType, type UploadPurpose } from '../domain/document';

export const DOCUMENT_STORAGE = Symbol('DOCUMENT_STORAGE');
export const IDENTITY_VERIFIER = Symbol('IDENTITY_VERIFIER');
export const INCOME_REVIEWER = Symbol('INCOME_REVIEWER');
export const DOCUMENTS = Symbol('DOCUMENTS');
export const KYC_STATUS = Symbol('KYC_STATUS');

/**
 * Almacenamiento privado de documentos (COPAYNI-43): la app sube directo con una URL prefirmada
 * de corta duración; el backend nunca recibe los archivos. Adaptador real: S3 con SSE-KMS
 * (`docs/architecture.md` §3); hoy, el simulado.
 */
export interface DocumentStoragePort {
  presignUpload(props: {
    key: string;
    contentType: string;
    sizeBytes: number;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: Date }>;
  /** Si el archivo ya se subió con ese tamaño. */
  exists(key: string, sizeBytes: number): Promise<boolean>;
}

export interface VerificationResult {
  status: DocumentStatus;
  /** Motivo del rechazo, para mostrar y reintentar. */
  reason: string | null;
}

/** Proveedor de verificación de identidad y OCR (spike COPAYNI-42). Hoy, el simulado. */
export interface IdentityVerifierPort {
  verifyNationalId(props: {
    userId: string;
    frontKey: string;
    backKey: string;
  }): Promise<VerificationResult>;
}

/** Revisión del comprobante de ingresos: proveedor o equipo de operaciones. Hoy, la simulada. */
export interface IncomeReviewerPort {
  review(props: {
    userId: string;
    kind: string;
    monthlyIncome: Money;
    keys: string[];
  }): Promise<VerificationResult>;
}

export interface Upload {
  id: string;
  userId: string;
  purpose: UploadPurpose;
  storageKey: string;
  sizeBytes: number;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface StoredDocument {
  id: string;
  type: DocumentType;
  kind: string;
  status: DocumentStatus;
  reason: string | null;
  monthlyIncome: Money | null;
  pages: number;
  submittedAt: Date;
  reviewedAt: Date | null;
}

export interface DocumentRepositoryPort {
  createUpload(upload: Omit<Upload, 'usedAt'>): Promise<void>;
  upload(id: string): Promise<Upload | null>;
  /**
   * Guarda el documento, marca usadas sus subidas y registra el resultado, en una transacción.
   * Las subidas ya usadas lo rechazan con UploadNotUsableError.
   */
  submit(props: {
    userId: string;
    type: DocumentType;
    kind: string;
    uploadIds: string[];
    monthlyIncome: Money | null;
    result: VerificationResult;
  }): Promise<StoredDocument>;
  /** Del más reciente al más antiguo. */
  list(userId: string): Promise<StoredDocument[]>;
}

/** Estado del KYC para la elegibilidad (unirse, cobrar, límite mensual). */
export interface KycStatusPort {
  identityVerified(userId: string): Promise<boolean>;
  /** El ingreso del último comprobante aprobado, o `null`. */
  approvedMonthlyIncome(userId: string): Promise<Money | null>;
}
