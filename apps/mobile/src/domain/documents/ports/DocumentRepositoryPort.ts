import type { Money } from '@/domain/shared/value-objects/Money';

import type {
  DocumentsOverview,
  IncomeProofKind,
  KycDocument,
  UploadPurpose,
} from '../KycDocument';

export interface UploadTicket {
  uploadId: string;
  /** URL prefirmada: el archivo se sube directo al almacenamiento, no al backend. */
  uploadUrl: string;
}

/** Documentos KYC del backend (docs/api/documents.md). */
export interface DocumentRepositoryPort {
  list(signal?: AbortSignal): Promise<DocumentsOverview>;
  requestUpload(
    purpose: UploadPurpose,
    contentType: string,
    sizeBytes: number,
  ): Promise<UploadTicket>;
  submitNationalId(frontUploadId: string, backUploadId: string): Promise<KycDocument>;
  submitProofOfIncome(
    kind: IncomeProofKind,
    monthlyIncome: Money,
    uploadIds: string[],
  ): Promise<KycDocument>;
}
