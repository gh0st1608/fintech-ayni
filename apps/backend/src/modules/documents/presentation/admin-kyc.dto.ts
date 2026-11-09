import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

import { MoneyResponse } from '../../circles/presentation/http/dto/join-config.response';
import {
  type KycReviewDetailView,
  type KycReviewSummaryView,
  type MaskedSubject,
} from '../application/kyc-review.use-cases';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  type DocumentStatus,
  type DocumentType,
  REJECTION_REASON_CODES,
  type RejectionReason,
} from '../domain/document';

export class KycReviewsQuery {
  @ApiPropertyOptional({ enum: DOCUMENT_STATUSES, default: 'in_review' })
  @IsOptional()
  @IsIn(DOCUMENT_STATUSES)
  status?: DocumentStatus;

  @ApiPropertyOptional({ enum: DOCUMENT_TYPES })
  @IsOptional()
  @IsIn(DOCUMENT_TYPES)
  type?: DocumentType;

  @ApiPropertyOptional({ description: 'nextCursor de la página anterior' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class KycApproveRequest {
  @ApiPropertyOptional({
    description:
      'Solo comprobante de ingresos: el ingreso mensual que figura en el documento, en unidades menores, si difiere del declarado',
    example: 320000,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  monthlyIncome?: number;

  @ApiPropertyOptional({ description: 'Nota interna: queda en la auditoría, la persona no la ve' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class KycRejectRequest {
  @ApiProperty({
    enum: REJECTION_REASON_CODES,
    description: 'La app muestra el texto de este motivo para que la persona corrija y reenvíe',
  })
  @IsIn(REJECTION_REASON_CODES)
  reason!: RejectionReason;

  @ApiPropertyOptional({ description: 'Nota interna: queda en la auditoría, la persona no la ve' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  note?: string;
}

export class KycSubjectResponse {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ nullable: true, type: String, example: 'Juana P.' })
  name!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'j***@mail.com' })
  email!: string | null;

  @ApiProperty({ nullable: true, type: String, example: '+51******321' })
  phone!: string | null;

  static from(subject: MaskedSubject): KycSubjectResponse {
    return { ...subject };
  }
}

export class KycReviewSummaryResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: DOCUMENT_TYPES })
  type!: DocumentType;

  @ApiProperty({ example: 'hr_letter' })
  kind!: string;

  @ApiProperty({ enum: DOCUMENT_STATUSES })
  status!: DocumentStatus;

  @ApiProperty()
  pages!: number;

  @ApiProperty({ nullable: true, type: MoneyResponse, description: 'Solo en proof_of_income' })
  monthlyIncome!: MoneyResponse | null;

  @ApiProperty()
  submittedAt!: string;

  @ApiProperty({ description: 'La persona envió después otro documento del mismo tipo' })
  superseded!: boolean;

  @ApiProperty({ type: KycSubjectResponse, description: 'Datos personales enmascarados' })
  subject!: KycSubjectResponse;

  static from(review: KycReviewSummaryView): KycReviewSummaryResponse {
    return {
      id: review.id,
      type: review.type,
      kind: review.kind,
      status: review.status,
      pages: review.pages,
      monthlyIncome: review.monthlyIncome && MoneyResponse.from(review.monthlyIncome),
      submittedAt: review.submittedAt.toISOString(),
      superseded: review.superseded,
      subject: KycSubjectResponse.from(review.subject),
    };
  }
}

export class KycReviewsResponse {
  @ApiProperty({ type: [KycReviewSummaryResponse] })
  items!: KycReviewSummaryResponse[];

  @ApiPropertyOptional({ nullable: true, type: String })
  nextCursor!: string | null;
}

export class KycPageFileResponse {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 'national_id_front' })
  purpose!: string;

  @ApiProperty()
  sizeBytes!: number;
}

export class KycReviewDetailResponse extends KycReviewSummaryResponse {
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Texto que ve la persona si se rechazó',
  })
  reason!: string | null;

  @ApiProperty({ nullable: true, type: String })
  reviewedAt!: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'Quién lo resolvió (personal)' })
  reviewedBy!: string | null;

  @ApiProperty({ type: [KycPageFileResponse] })
  pageFiles!: KycPageFileResponse[];

  static fromView(review: KycReviewDetailView): KycReviewDetailResponse {
    return {
      ...KycReviewSummaryResponse.from(review),
      reason: review.reason,
      reviewedAt: review.reviewedAt?.toISOString() ?? null,
      reviewedBy: review.reviewedBy,
      pageFiles: review.pageFiles,
    };
  }
}

export class KycPageUrlResponse {
  @ApiProperty({ description: 'URL de lectura de 60 s. No guardarla ni compartirla' })
  url!: string;

  @ApiProperty()
  expiresAt!: string;
}
