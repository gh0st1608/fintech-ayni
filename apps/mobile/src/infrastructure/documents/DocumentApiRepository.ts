import { z } from 'zod';

import type {
  DocumentRepositoryPort,
  UploadTicket,
} from '@/domain/documents/ports/DocumentRepositoryPort';
import type {
  DocumentsOverview,
  DocumentStatus,
  DocumentSummaryStatus,
  DocumentType,
  IncomeProofKind,
  KycDocument,
  UploadPurpose,
} from '@/domain/documents/KycDocument';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';
import type { Money } from '@/domain/shared/value-objects/Money';
import { moneyDto, toMoney } from '@/infrastructure/circles/moneyDto';

const TYPE_BY_DTO = {
  national_id: 'nationalId',
  proof_of_income: 'proofOfIncome',
  additional: 'additional',
} as const satisfies Record<string, DocumentType>;
const STATUS_BY_DTO = {
  in_review: 'inReview',
  approved: 'approved',
  rejected: 'rejected',
} as const satisfies Record<string, DocumentStatus>;
const PURPOSE_DTO = {
  nationalIdFront: 'national_id_front',
  nationalIdBack: 'national_id_back',
  proofOfIncome: 'proof_of_income',
  additional: 'additional',
} as const satisfies Record<UploadPurpose, string>;
const KIND_DTO = {
  hrLetter: 'hr_letter',
  bankStatement: 'bank_statement',
} as const satisfies Record<IncomeProofKind, string>;

const statusDto = z.enum(['in_review', 'approved', 'rejected']);

/** DTO de un documento (docs/api/documents.md). */
const documentDto = z.object({
  id: z.string().min(1),
  type: z.enum(['national_id', 'proof_of_income', 'additional']),
  kind: z.string(),
  status: statusDto,
  reason: z.string().nullable(),
  monthlyIncome: moneyDto.nullable(),
  pages: z.number().int().positive(),
  submittedAt: z.iso.datetime({ offset: true }),
});

const overviewDto = z.object({
  summary: z.object({
    national_id: z.union([statusDto, z.literal('not_submitted')]),
    proof_of_income: z.union([statusDto, z.literal('not_submitted')]),
    additional: z.union([statusDto, z.literal('not_submitted')]),
  }),
  items: z.array(documentDto),
});

const ticketDto = z.object({
  uploadId: z.string().min(1),
  uploadUrl: z.string().url(),
  expiresAt: z.iso.datetime({ offset: true }),
});

const toSummaryStatus = (
  value: z.infer<typeof statusDto> | 'not_submitted',
): DocumentSummaryStatus => (value === 'not_submitted' ? 'notSubmitted' : STATUS_BY_DTO[value]);

function toDocument(dto: z.infer<typeof documentDto>): KycDocument {
  return {
    id: dto.id,
    type: TYPE_BY_DTO[dto.type],
    kind: dto.kind,
    status: STATUS_BY_DTO[dto.status],
    reason: dto.reason,
    monthlyIncome: dto.monthlyIncome && toMoney(dto.monthlyIncome),
    pages: dto.pages,
    submittedAt: new Date(dto.submittedAt),
  };
}

/** Adaptador HTTP de los documentos KYC (COPAYNI-43, 46, 47 y 48). */
export class DocumentApiRepository implements DocumentRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async list(signal?: AbortSignal): Promise<DocumentsOverview> {
    const dto = await this.http.get('/me/documents', {
      signal,
      parse: (data) => overviewDto.parse(data),
    });
    return {
      summary: {
        nationalId: toSummaryStatus(dto.summary.national_id),
        proofOfIncome: toSummaryStatus(dto.summary.proof_of_income),
        additional: toSummaryStatus(dto.summary.additional),
      },
      items: dto.items.map(toDocument),
    };
  }

  async requestUpload(
    purpose: UploadPurpose,
    contentType: string,
    sizeBytes: number,
  ): Promise<UploadTicket> {
    const dto = await this.http.post('/me/documents/uploads', {
      body: { purpose: PURPOSE_DTO[purpose], contentType, sizeBytes },
      parse: (data) => ticketDto.parse(data),
    });
    return { uploadId: dto.uploadId, uploadUrl: dto.uploadUrl };
  }

  async submitNationalId(frontUploadId: string, backUploadId: string): Promise<KycDocument> {
    return toDocument(
      await this.http.post('/me/documents/national-id', {
        body: { frontUploadId, backUploadId },
        parse: (data) => documentDto.parse(data),
      }),
    );
  }

  async submitProofOfIncome(
    kind: IncomeProofKind,
    monthlyIncome: Money,
    uploadIds: string[],
  ): Promise<KycDocument> {
    return toDocument(
      await this.http.post('/me/documents/proof-of-income', {
        body: { kind: KIND_DTO[kind], monthlyIncome: monthlyIncome.amount, uploadIds },
        parse: (data) => documentDto.parse(data),
      }),
    );
  }
}
