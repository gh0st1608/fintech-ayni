import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { type Principal } from '../../../shared/application/ports/access-token-verifier.port';
import { CLOCK, type ClockPort } from '../../../shared/application/ports/clock.port';
import { type Money } from '../../../shared/domain/value-objects/money';
import { ValidationError } from '../../../shared/errors/app-error';
import {
  assertUploadable,
  DOCUMENT_KINDS,
  type DocumentType,
  MAX_PAGES,
  type UploadPurpose,
  UploadNotUsableError,
} from '../domain/document';
import {
  DOCUMENT_STORAGE,
  DOCUMENTS,
  type DocumentRepositoryPort,
  type DocumentStoragePort,
  IDENTITY_VERIFIER,
  type IdentityVerifierPort,
  INCOME_REVIEWER,
  type IncomeReviewerPort,
  type StoredDocument,
  type Upload,
  type VerificationResult,
} from './ports';

export const DOCUMENT_SETTINGS = Symbol('DOCUMENT_SETTINGS');

/** Una subida se puede enviar hasta 24 h después de vencer su URL (el archivo ya está subido). */
const UPLOAD_SUBMIT_GRACE_MS = 24 * 3600 * 1000;

export interface DocumentSettings {
  /** Vigencia de la URL de subida (minutos, COPAYNI-43). */
  uploadUrlTtlSeconds: number;
}

export interface UploadTicket {
  uploadId: string;
  uploadUrl: string;
  expiresAt: Date;
}

/**
 * `POST /v1/me/documents/uploads` (COPAYNI-43): reserva una subida y devuelve la URL prefirmada.
 * Valida el tipo y el tamaño; la clave del archivo no incluye datos personales.
 */
@Injectable()
export class RequestUploadUseCase {
  constructor(
    @Inject(DOCUMENTS) private readonly documents: DocumentRepositoryPort,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStoragePort,
    @Inject(DOCUMENT_SETTINGS) private readonly settings: DocumentSettings,
  ) {}

  async execute(
    principal: Principal,
    request: { purpose: UploadPurpose; contentType: string; sizeBytes: number },
  ): Promise<UploadTicket> {
    assertUploadable(request.contentType, request.sizeBytes);
    const id = randomUUID();
    const storageKey = `kyc/${principal.userId}/${request.purpose}/${id}`;
    const { url, expiresAt } = await this.storage.presignUpload({
      key: storageKey,
      contentType: request.contentType,
      sizeBytes: request.sizeBytes,
      expiresInSeconds: this.settings.uploadUrlTtlSeconds,
    });
    await this.documents.createUpload({
      id,
      userId: principal.userId,
      purpose: request.purpose,
      storageKey,
      sizeBytes: request.sizeBytes,
      expiresAt,
    });
    return { uploadId: id, uploadUrl: url, expiresAt };
  }
}

/**
 * Envío de un documento a revisión (COPAYNI-47, 48 y 49). Cada subida tiene que ser del usuario,
 * del propósito correcto, estar completa en el almacenamiento y no haberse usado.
 */
@Injectable()
export class SubmitDocumentUseCase {
  private readonly logger = new Logger('Documents');

  constructor(
    @Inject(DOCUMENTS) private readonly documents: DocumentRepositoryPort,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStoragePort,
    @Inject(IDENTITY_VERIFIER) private readonly identity: IdentityVerifierPort,
    @Inject(INCOME_REVIEWER) private readonly income: IncomeReviewerPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  /** Anverso y reverso del documento de identidad (COPAYNI-47). */
  async nationalId(
    principal: Principal,
    command: { frontUploadId: string; backUploadId: string },
  ): Promise<StoredDocument> {
    const front = await this.usable(principal, command.frontUploadId, 'national_id_front');
    const back = await this.usable(principal, command.backUploadId, 'national_id_back');
    const result = await this.identity.verifyNationalId({
      userId: principal.userId,
      frontKey: front.storageKey,
      backKey: back.storageKey,
    });
    return this.save(principal, 'national_id', 'national_id', [front, back], null, result);
  }

  /** Ingreso mensual declarado y su comprobante (COPAYNI-48). */
  async proofOfIncome(
    principal: Principal,
    command: { kind: string; monthlyIncome: Money; uploadIds: string[] },
  ): Promise<StoredDocument> {
    this.assertKind('proof_of_income', command.kind);
    if (!command.monthlyIncome.isPositive()) {
      throw new ValidationError('El ingreso debe ser mayor que cero', { monthlyIncome: 'invalid' });
    }
    const uploads = await this.pages(principal, command.uploadIds, 'proof_of_income');
    const result = await this.income.review({
      userId: principal.userId,
      kind: command.kind,
      monthlyIncome: command.monthlyIncome,
      keys: uploads.map(({ storageKey }) => storageKey),
    });
    return this.save(
      principal,
      'proof_of_income',
      command.kind,
      uploads,
      command.monthlyIncome,
      result,
    );
  }

  /**
   * Documento adicional (COPAYNI-49): queda en revisión manual. Qué documentos suben el límite
   * está pendiente (R5, R11).
   */
  async additional(
    principal: Principal,
    command: { kind: string; uploadIds: string[] },
  ): Promise<StoredDocument> {
    this.assertKind('additional', command.kind);
    const uploads = await this.pages(principal, command.uploadIds, 'additional');
    return this.save(principal, 'additional', command.kind, uploads, null, {
      status: 'in_review',
      reason: null,
    });
  }

  private assertKind(type: DocumentType, kind: string): void {
    if (!(DOCUMENT_KINDS[type] as readonly string[]).includes(kind)) {
      throw new ValidationError('Tipo de documento inválido', { kind: 'invalid' });
    }
  }

  private async pages(
    principal: Principal,
    uploadIds: string[],
    purpose: UploadPurpose,
  ): Promise<Upload[]> {
    if (
      uploadIds.length < 1 ||
      uploadIds.length > MAX_PAGES ||
      new Set(uploadIds).size !== uploadIds.length
    ) {
      throw new ValidationError(`Envía de 1 a ${MAX_PAGES} páginas distintas`, {
        uploadIds: 'invalid',
      });
    }
    const uploads: Upload[] = [];
    for (const id of uploadIds) uploads.push(await this.usable(principal, id, purpose));
    return uploads;
  }

  private async usable(
    principal: Principal,
    uploadId: string,
    purpose: UploadPurpose,
  ): Promise<Upload> {
    const upload = await this.documents.upload(uploadId);
    if (
      upload === null ||
      upload.userId !== principal.userId ||
      upload.purpose !== purpose ||
      upload.usedAt !== null ||
      this.clock.now().getTime() - upload.expiresAt.getTime() > UPLOAD_SUBMIT_GRACE_MS ||
      !(await this.storage.exists(upload.storageKey, upload.sizeBytes))
    ) {
      throw new UploadNotUsableError(uploadId);
    }
    return upload;
  }

  private async save(
    principal: Principal,
    type: DocumentType,
    kind: string,
    uploads: Upload[],
    monthlyIncome: Money | null,
    result: VerificationResult,
  ): Promise<StoredDocument> {
    const document = await this.documents.submit({
      userId: principal.userId,
      type,
      kind,
      uploadIds: uploads.map(({ id }) => id),
      monthlyIncome,
      result,
    });
    // Sin datos del documento en el log: solo el tipo y el resultado.
    this.logger.log({
      event: 'documents.submitted',
      userId: principal.userId,
      documentId: document.id,
      type,
      status: document.status,
    });
    return document;
  }
}

/** `GET /v1/me/documents` (COPAYNI-46). */
@Injectable()
export class ListDocumentsUseCase {
  constructor(@Inject(DOCUMENTS) private readonly documents: DocumentRepositoryPort) {}

  execute(principal: Principal): Promise<StoredDocument[]> {
    return this.documents.list(principal.userId);
  }
}
