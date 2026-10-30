import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { MoneyResponse } from '../../circles/presentation/http/dto/join-config.response';
import { type StoredDocument } from '../application/ports';
import {
  ALLOWED_CONTENT_TYPES,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  type DocumentStatus,
  type DocumentType,
  MAX_PAGES,
  MAX_UPLOAD_BYTES,
  UPLOAD_PURPOSES,
  type UploadPurpose,
} from '../domain/document';

export class RequestUploadRequest {
  @ApiProperty({ enum: UPLOAD_PURPOSES })
  @IsIn(UPLOAD_PURPOSES)
  purpose!: UploadPurpose;

  @ApiProperty({ enum: ALLOWED_CONTENT_TYPES })
  @IsString()
  contentType!: string;

  @ApiProperty({ example: 524288, maximum: MAX_UPLOAD_BYTES })
  @Type(() => Number)
  @IsInt()
  sizeBytes!: number;
}

export class UploadTicketResponse {
  @ApiProperty({ format: 'uuid' })
  uploadId!: string;

  @ApiProperty({ description: 'URL prefirmada: la app hace PUT del archivo con su Content-Type' })
  uploadUrl!: string;

  @ApiProperty({ description: 'La URL vence en minutos' })
  expiresAt!: string;
}

export class NationalIdRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  frontUploadId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  backUploadId!: string;
}

export class ProofOfIncomeRequest {
  @ApiProperty({ enum: ['hr_letter', 'bank_statement'] })
  @IsString()
  kind!: string;

  @ApiProperty({ example: 350000, description: 'Ingreso mensual en unidades menores' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  monthlyIncome!: number;

  @ApiProperty({ type: [String], maxItems: MAX_PAGES, description: 'Una subida por página' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PAGES)
  @IsUUID('all', { each: true })
  uploadIds!: string[];
}

export class AdditionalDocumentRequest {
  @ApiProperty({ enum: ['utility_bill', 'driver_license', 'other'] })
  @IsString()
  kind!: string;

  @ApiProperty({ type: [String], maxItems: MAX_PAGES })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PAGES)
  @IsUUID('all', { each: true })
  uploadIds!: string[];
}

/** Contrato de un documento (docs/api/documents.md). */
export class DocumentResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: DOCUMENT_TYPES })
  type!: DocumentType;

  @ApiProperty({ example: 'hr_letter' })
  kind!: string;

  @ApiProperty({ enum: DOCUMENT_STATUSES })
  status!: DocumentStatus;

  @ApiProperty({ nullable: true, type: String, description: 'Motivo del rechazo' })
  reason!: string | null;

  @ApiProperty({ nullable: true, type: MoneyResponse, description: 'Solo en proof_of_income' })
  monthlyIncome!: MoneyResponse | null;

  @ApiProperty({ example: 2 })
  pages!: number;

  @ApiProperty()
  submittedAt!: string;

  static from(document: StoredDocument): DocumentResponse {
    return {
      id: document.id,
      type: document.type,
      kind: document.kind,
      status: document.status,
      reason: document.reason,
      monthlyIncome: document.monthlyIncome && MoneyResponse.from(document.monthlyIncome),
      pages: document.pages,
      submittedAt: document.submittedAt.toISOString(),
    };
  }
}

/** Contrato de `GET /v1/me/documents`: el estado de cada tipo y el historial. */
export class DocumentsResponse {
  @ApiProperty({
    description: 'Estado del último documento de cada tipo, o not_submitted',
    example: { national_id: 'approved', proof_of_income: 'in_review', additional: 'not_submitted' },
  })
  summary!: Record<DocumentType, DocumentStatus | 'not_submitted'>;

  @ApiProperty({ type: [DocumentResponse], description: 'Del más reciente al más antiguo' })
  items!: DocumentResponse[];

  static from(documents: StoredDocument[]): DocumentsResponse {
    const summary = Object.fromEntries(
      DOCUMENT_TYPES.map((type) => [
        type,
        documents.find((document) => document.type === type)?.status ?? 'not_submitted',
      ]),
    ) as Record<DocumentType, DocumentStatus | 'not_submitted'>;
    return { summary, items: documents.map((document) => DocumentResponse.from(document)) };
  }
}
