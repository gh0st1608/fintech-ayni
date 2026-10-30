import type { DocumentRepositoryPort } from '@/domain/documents/ports/DocumentRepositoryPort';
import type { FileUploaderPort, LocalFileCleanerPort } from '@/domain/documents/ports/FilePorts';
import type {
  DocumentsOverview,
  IncomeProofKind,
  KycDocument,
  UploadPurpose,
} from '@/domain/documents/KycDocument';
import { assertUploadable, type LocalFile, MAX_PAGES } from '@/domain/documents/LocalFile';
import { DomainError } from '@/domain/shared/errors/DomainError';
import type { Money } from '@/domain/shared/value-objects/Money';

export class InvalidIncomeProofError extends DomainError {
  readonly code = 'INVALID_INCOME_PROOF';

  constructor(readonly problem: 'income' | 'pages') {
    super(`Invalid income proof: ${problem}`);
  }
}

/** Mis documentos y su estado (COPAYNI-46). */
export class ListDocumentsUseCase {
  constructor(private readonly documents: DocumentRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<DocumentsOverview> {
    return this.documents.list(signal);
  }
}

/**
 * Sube cada archivo directo al almacenamiento con una URL prefirmada y borra la copia local
 * (COPAYNI-43). Valida el tipo y el tamaño antes de pedir la URL.
 */
export class DocumentUploader {
  constructor(
    private readonly documents: DocumentRepositoryPort,
    private readonly uploader: FileUploaderPort,
    private readonly cleaner: LocalFileCleanerPort,
  ) {}

  async upload(purpose: UploadPurpose, file: LocalFile): Promise<string> {
    assertUploadable(file);
    const ticket = await this.documents.requestUpload(purpose, file.mimeType, file.sizeBytes);
    await this.uploader.upload(ticket.uploadUrl, file);
    // La imagen del documento no debe quedar en el teléfono más de lo necesario.
    await this.cleaner.remove(file).catch(() => undefined);
    return ticket.uploadId;
  }
}

/** Escanear ambas caras del documento de identidad (COPAYNI-47). */
export class SubmitNationalIdUseCase {
  constructor(
    private readonly documents: DocumentRepositoryPort,
    private readonly uploader: DocumentUploader,
  ) {}

  async execute(front: LocalFile, back: LocalFile): Promise<KycDocument> {
    const frontId = await this.uploader.upload('nationalIdFront', front);
    const backId = await this.uploader.upload('nationalIdBack', back);
    return this.documents.submitNationalId(frontId, backId);
  }
}

/** Ingreso mensual declarado y su comprobante (COPAYNI-48). */
export class SubmitProofOfIncomeUseCase {
  constructor(
    private readonly documents: DocumentRepositoryPort,
    private readonly uploader: DocumentUploader,
  ) {}

  async execute(
    kind: IncomeProofKind,
    monthlyIncome: Money,
    pages: LocalFile[],
  ): Promise<KycDocument> {
    if (monthlyIncome.amount <= 0) throw new InvalidIncomeProofError('income');
    if (pages.length < 1 || pages.length > MAX_PAGES) throw new InvalidIncomeProofError('pages');
    const uploadIds: string[] = [];
    for (const page of pages) uploadIds.push(await this.uploader.upload('proofOfIncome', page));
    return this.documents.submitProofOfIncome(kind, monthlyIncome, uploadIds);
  }
}
