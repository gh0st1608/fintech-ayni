import type {
  DocumentRepositoryPort,
  UploadTicket,
} from '@/domain/documents/ports/DocumentRepositoryPort';
import type { FileUploaderPort, LocalFileCleanerPort } from '@/domain/documents/ports/FilePorts';
import type {
  DocumentsOverview,
  DocumentType,
  IncomeProofKind,
  KycDocument,
  UploadPurpose,
} from '@/domain/documents/KycDocument';
import type { LocalFile } from '@/domain/documents/LocalFile';
import type { Money } from '@/domain/shared/value-objects/Money';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

/**
 * Documentos falsos (solo dev y pruebas), como el backend con el proveedor simulado: el
 * documento de identidad y el comprobante se aprueban al enviarlos.
 */
export class InMemoryDocumentRepository implements DocumentRepositoryPort {
  documents: KycDocument[] = [];
  private readonly latencyMs: number;
  private sequence = 0;

  constructor(options: { latencyMs?: number; documents?: KycDocument[] } = {}) {
    this.latencyMs = options.latencyMs ?? 300;
    this.documents = [...(options.documents ?? [])];
  }

  async list(signal?: AbortSignal): Promise<DocumentsOverview> {
    await simulateLatency(this.latencyMs, signal);
    const latest = (type: DocumentType) =>
      this.documents.find((document) => document.type === type)?.status ?? 'notSubmitted';
    return {
      summary: {
        nationalId: latest('nationalId'),
        proofOfIncome: latest('proofOfIncome'),
        additional: latest('additional'),
      },
      items: [...this.documents],
    };
  }

  async requestUpload(purpose: UploadPurpose): Promise<UploadTicket> {
    await simulateLatency(this.latencyMs);
    this.sequence += 1;
    return {
      uploadId: `upload-${this.sequence}`,
      uploadUrl: `https://documents.fake.ayni/${purpose}/${this.sequence}`,
    };
  }

  submitNationalId(_front: string, _back: string): Promise<KycDocument> {
    return this.save({ type: 'nationalId', kind: 'national_id', monthlyIncome: null, pages: 2 });
  }

  submitProofOfIncome(
    kind: IncomeProofKind,
    monthlyIncome: Money,
    uploadIds: string[],
  ): Promise<KycDocument> {
    return this.save({ type: 'proofOfIncome', kind, monthlyIncome, pages: uploadIds.length });
  }

  private async save(
    document: Pick<KycDocument, 'type' | 'kind' | 'monthlyIncome' | 'pages'>,
  ): Promise<KycDocument> {
    await simulateLatency(this.latencyMs);
    this.sequence += 1;
    const saved: KycDocument = {
      ...document,
      id: `doc-${this.sequence}`,
      status: 'approved',
      reason: null,
      submittedAt: new Date(),
    };
    this.documents = [saved, ...this.documents];
    return saved;
  }
}

/** Subida falsa: recuerda qué se subió, sin red. */
export class FakeFileUploader implements FileUploaderPort {
  uploaded: { url: string; file: LocalFile }[] = [];

  upload(url: string, file: LocalFile): Promise<void> {
    this.uploaded.push({ url, file });
    return Promise.resolve();
  }
}

export class FakeLocalFileCleaner implements LocalFileCleanerPort {
  removed: string[] = [];

  constructor(private readonly fails = false) {}

  remove(file: LocalFile): Promise<void> {
    if (this.fails) return Promise.reject(new Error('cannot delete'));
    this.removed.push(file.uri);
    return Promise.resolve();
  }
}
