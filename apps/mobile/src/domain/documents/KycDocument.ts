import type { Money } from '@/domain/shared/value-objects/Money';

export const DOCUMENT_TYPES = ['nationalId', 'proofOfIncome', 'additional'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export type DocumentStatus = 'inReview' | 'approved' | 'rejected';
export type DocumentSummaryStatus = DocumentStatus | 'notSubmitted';

export const INCOME_PROOF_KINDS = ['hrLetter', 'bankStatement'] as const;
/** Carta de RR. HH. o extracto bancario (COPAYNI-48). */
export type IncomeProofKind = (typeof INCOME_PROOF_KINDS)[number];

/** Un documento enviado a revisión (docs/api/documents.md). */
export interface KycDocument {
  id: string;
  type: DocumentType;
  kind: string;
  status: DocumentStatus;
  /** Motivo del rechazo, para reintentar. */
  reason: string | null;
  monthlyIncome: Money | null;
  pages: number;
  submittedAt: Date;
}

/** GET /me/documents: el estado del último documento de cada tipo y el historial. */
export interface DocumentsOverview {
  summary: Record<DocumentType, DocumentSummaryStatus>;
  items: KycDocument[];
}

/** Para qué se sube un archivo (COPAYNI-43). */
export type UploadPurpose = 'nationalIdFront' | 'nationalIdBack' | 'proofOfIncome' | 'additional';
