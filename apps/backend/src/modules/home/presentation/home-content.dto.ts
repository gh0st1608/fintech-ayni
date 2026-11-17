import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  CONTENT_LANGUAGES,
  CONTENT_TARGETS,
  type ContentTarget,
  type ContentTexts,
  GOAL_BACKGROUNDS,
  type GoalBackground,
  type HomeContent,
  type HomeGoal,
  type HomeOffer,
  ILLUSTRATIONS,
  type Illustration,
  MAX_OFFER_TITLE,
  OFFER_BACKGROUNDS,
  type OfferBackground,
  type ResolvedItem,
} from '../domain/home-content';

export class HomeContentQuery {
  @ApiPropertyOptional({ enum: CONTENT_LANGUAGES, description: 'Sin valor o desconocido: es' })
  @IsOptional()
  @IsString()
  lang?: string;
}

/** Una tarjeta como la ve la app: ya resuelta al idioma. */
export class HomeItemResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true })
  subtitle!: string | null;

  @ApiProperty({ enum: ILLUSTRATIONS, description: 'Clave del catálogo de la app' })
  illustration!: Illustration;

  @ApiProperty({
    enum: [...OFFER_BACKGROUNDS, ...GOAL_BACKGROUNDS],
    description: 'Token del design system; el color lo resuelve la app',
  })
  background!: OfferBackground | GoalBackground;

  @ApiProperty({ enum: CONTENT_TARGETS, description: 'Pantalla a la que lleva el toque' })
  target!: ContentTarget;

  @ApiProperty({ nullable: true, description: 'Monto en unidades menores para join_circle' })
  targetAmount!: number | null;

  static from(item: ResolvedItem): HomeItemResponse {
    return { ...item };
  }
}

export class HomeContentResponse {
  @ApiProperty({ type: [HomeItemResponse] })
  offers!: HomeItemResponse[];

  @ApiProperty({ type: [HomeItemResponse] })
  goals!: HomeItemResponse[];

  static from(content: HomeContent): HomeContentResponse {
    return {
      offers: content.offers.map((item) => HomeItemResponse.from(item)),
      goals: content.goals.map((item) => HomeItemResponse.from(item)),
    };
  }
}

/** Texto de una tarjeta en un idioma. */
export class ContentTextDto {
  @ApiProperty({ maxLength: MAX_OFFER_TITLE })
  @IsString()
  @MaxLength(MAX_OFFER_TITLE)
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_OFFER_TITLE)
  subtitle?: string | null;
}

/** Texto por idioma: el español es obligatorio y el inglés opcional. */
export class ContentTextsDto {
  @ApiProperty({ type: ContentTextDto })
  @ValidateNested()
  @Type(() => ContentTextDto)
  es!: ContentTextDto;

  @ApiPropertyOptional({ type: ContentTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentTextDto)
  en?: ContentTextDto;
}

class ContentItemRequest {
  @ApiProperty({
    type: ContentTextsDto,
    example: { es: { title: 'Ahorro', subtitle: 'Gana cashback' } },
  })
  @ValidateNested()
  @Type(() => ContentTextsDto)
  texts!: ContentTextsDto;

  @ApiProperty({ enum: ILLUSTRATIONS })
  @IsIn(ILLUSTRATIONS)
  illustration!: Illustration;

  @ApiProperty({ enum: CONTENT_TARGETS })
  @IsIn(CONTENT_TARGETS)
  target!: ContentTarget;

  @ApiPropertyOptional({ nullable: true, description: 'Solo con target join_circle' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  targetAmount?: number | null;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  position!: number;

  @ApiProperty()
  @IsBoolean()
  active!: boolean;
}

export class SaveOfferRequest extends ContentItemRequest {
  @ApiProperty({ enum: OFFER_BACKGROUNDS })
  @IsIn(OFFER_BACKGROUNDS)
  background!: OfferBackground;

  @ApiPropertyOptional({ nullable: true, description: 'Desde cuándo se muestra' })
  @IsOptional()
  @IsISO8601()
  startsOn?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Hasta cuándo se muestra' })
  @IsOptional()
  @IsISO8601()
  endsOn?: string | null;
}

export class SaveGoalRequest extends ContentItemRequest {
  @ApiProperty({ enum: GOAL_BACKGROUNDS })
  @IsIn(GOAL_BACKGROUNDS)
  background!: GoalBackground;
}

/** Lo que ve el back-office: también lo apagado y lo vencido, con quién lo tocó. */
export class AdminHomeItemResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Texto por idioma' })
  texts!: ContentTexts;

  @ApiProperty({ enum: ILLUSTRATIONS })
  illustration!: Illustration;

  @ApiProperty()
  background!: string;

  @ApiProperty({ enum: CONTENT_TARGETS })
  target!: ContentTarget;

  @ApiProperty({ nullable: true })
  targetAmount!: number | null;

  @ApiProperty()
  position!: number;

  @ApiProperty()
  active!: boolean;

  @ApiPropertyOptional({ nullable: true })
  startsOn?: string | null;

  @ApiPropertyOptional({ nullable: true })
  endsOn?: string | null;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty({ nullable: true })
  updatedBy!: string | null;

  static from(item: HomeOffer | HomeGoal): AdminHomeItemResponse {
    const offer = item as HomeOffer;
    return {
      id: item.id,
      texts: item.texts,
      illustration: item.illustration,
      background: item.background,
      target: item.target,
      targetAmount: item.targetAmount,
      position: item.position,
      active: item.active,
      ...('startsOn' in offer
        ? {
            startsOn: offer.startsOn ? offer.startsOn.toISOString() : null,
            endsOn: offer.endsOn ? offer.endsOn.toISOString() : null,
          }
        : {}),
      updatedAt: item.updatedAt.toISOString(),
      updatedBy: item.updatedBy,
    };
  }
}

export class AdminHomeContentResponse {
  @ApiProperty({ type: [AdminHomeItemResponse] })
  offers!: AdminHomeItemResponse[];

  @ApiProperty({ type: [AdminHomeItemResponse] })
  goals!: AdminHomeItemResponse[];

  static from(content: { offers: HomeOffer[]; goals: HomeGoal[] }): AdminHomeContentResponse {
    return {
      offers: content.offers.map((item) => AdminHomeItemResponse.from(item)),
      goals: content.goals.map((item) => AdminHomeItemResponse.from(item)),
    };
  }
}

/** Normaliza el texto que llega del back-office al mapa por idioma del dominio. */
export function toTexts(input: ContentTextsDto): ContentTexts {
  const texts = {} as ContentTexts;
  for (const language of CONTENT_LANGUAGES) {
    const value = input[language];
    texts[language] = {
      title: value?.title?.trim() ?? '',
      subtitle: value?.subtitle?.trim() ? value.subtitle.trim() : null,
    };
  }
  return texts;
}
