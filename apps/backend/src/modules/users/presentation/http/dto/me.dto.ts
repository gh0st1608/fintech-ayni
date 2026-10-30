import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { MoneyResponse } from '../../../../circles/presentation/http/dto/join-config.response';
import { type MyProfile } from '../../../application/use-cases/get-my-profile.use-case';
import { type UserStatus } from '../../../domain/entities/user';

/** Etiqueta BCP 47 sencilla: idioma y, opcionalmente, escritura y región (`es`, `pt-BR`). */
const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|\d{3}))?$/;

export class UpdateMeRequest {
  @ApiProperty({
    required: false,
    example: 'en',
    description: 'Código BCP 47 del catálogo de idiomas de la app',
  })
  @IsOptional()
  @MaxLength(35)
  @Matches(LANGUAGE_TAG)
  preferredLanguage?: string;

  @ApiProperty({ required: false, example: 'Ana', description: '1 a 80 caracteres' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @ApiProperty({ required: false, example: 'Quispe', description: '1 a 80 caracteres' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;
}

export class MeResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true, type: String })
  email!: string | null;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ enum: ['pending_verification', 'active'] })
  status!: UserStatus;

  @ApiProperty({ nullable: true, type: String, example: 'es' })
  preferredLanguage!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'Ana' })
  firstName!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'Quispe' })
  lastName!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Nombre y apellido; null si no cargó ninguno (COPAYNI-45)',
  })
  fullName!: string | null;

  @ApiProperty({
    nullable: true,
    type: MoneyResponse,
    description: 'Límite mensual de pay-in (R5, provisional); null si no se le restringe',
  })
  monthlyPayInLimit!: MoneyResponse | null;

  static from({ user, monthlyPayInLimit }: MyProfile): MeResponse {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      status: user.status,
      preferredLanguage: user.preferredLanguage,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      monthlyPayInLimit: monthlyPayInLimit && MoneyResponse.from(monthlyPayInLimit),
    };
  }
}
