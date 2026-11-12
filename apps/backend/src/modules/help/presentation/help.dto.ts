import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import {
  HELP_LANGUAGES,
  type HelpContent,
  MAX_ANSWER,
  MAX_FAQS,
  MAX_POLICY,
  MAX_QUESTION,
} from '../application/help';

export class HelpQuery {
  @ApiPropertyOptional({ enum: HELP_LANGUAGES, description: 'Sin contenido en ese idioma: es' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  lang?: string;
}

class FaqInput {
  @ApiProperty({ maxLength: MAX_QUESTION })
  @IsString()
  @MaxLength(MAX_QUESTION)
  question!: string;

  @ApiProperty({ maxLength: MAX_ANSWER })
  @IsString()
  @MaxLength(MAX_ANSWER)
  answer!: string;
}

/** `PUT /admin/v1/help/:lang`: reemplaza todo el contenido del idioma, en el orden enviado. */
export class UpdateHelpRequest {
  @ApiProperty({ type: [FaqInput], maxItems: MAX_FAQS })
  @IsArray()
  @ArrayMaxSize(MAX_FAQS)
  @ValidateNested({ each: true })
  @Type(() => FaqInput)
  faqs!: FaqInput[];

  @ApiProperty({ nullable: true, maxLength: MAX_POLICY, description: 'null: sin publicar (L4)' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_POLICY)
  paymentPolicy!: string | null;
}

export class FaqResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  question!: string;

  @ApiProperty()
  answer!: string;
}

export class PaymentPolicyResponse {
  @ApiProperty({ description: 'Texto plano; los saltos de línea separan párrafos' })
  body!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

/** `GET /v1/help`. */
export class HelpResponse {
  @ApiProperty({ enum: HELP_LANGUAGES, description: 'Idioma del contenido devuelto' })
  language!: string;

  @ApiProperty({ type: [FaqResponse] })
  faqs!: FaqResponse[];

  @ApiProperty({ type: PaymentPolicyResponse, nullable: true })
  paymentPolicy!: PaymentPolicyResponse | null;

  @ApiProperty({
    nullable: true,
    example: { whatsapp: 'https://wa.me/51999999999' },
    description: 'null si no hay un canal configurado',
  })
  support!: { whatsapp: string } | null;

  static from(content: HelpContent, supportWhatsapp: string | null): HelpResponse {
    return {
      language: content.language,
      faqs: content.faqs.map(({ id, question, answer }) => ({ id, question, answer })),
      paymentPolicy: content.paymentPolicy
        ? {
            body: content.paymentPolicy.body,
            updatedAt: content.paymentPolicy.updatedAt.toISOString(),
          }
        : null,
      support: supportWhatsapp ? { whatsapp: `https://wa.me/${supportWhatsapp}` } : null,
    };
  }
}

/** `GET` y `PUT /admin/v1/help/:lang`. */
export class AdminHelpResponse {
  @ApiProperty({ enum: HELP_LANGUAGES })
  language!: string;

  @ApiProperty({ type: [FaqResponse] })
  faqs!: FaqResponse[];

  @ApiProperty({ nullable: true })
  paymentPolicy!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  updatedAt!: string | null;

  @ApiProperty({ nullable: true })
  updatedBy!: string | null;

  static from(content: HelpContent): AdminHelpResponse {
    return {
      language: content.language,
      faqs: content.faqs.map(({ id, question, answer }) => ({ id, question, answer })),
      paymentPolicy: content.paymentPolicy?.body ?? null,
      updatedAt: content.updatedAt?.toISOString() ?? null,
      updatedBy: content.updatedBy,
    };
  }
}
