import { ApiProperty } from '@nestjs/swagger';
import { Matches, MaxLength } from 'class-validator';

import { type User, type UserStatus } from '../../../domain/entities/user';

/** Etiqueta BCP 47 sencilla: idioma y, opcionalmente, escritura y región (`es`, `pt-BR`). */
const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|\d{3}))?$/;

export class UpdateMeRequest {
  @ApiProperty({ example: 'en', description: 'Código BCP 47 del catálogo de idiomas de la app' })
  @MaxLength(35)
  @Matches(LANGUAGE_TAG)
  preferredLanguage!: string;
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

  static from(user: User): MeResponse {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      status: user.status,
      preferredLanguage: user.preferredLanguage,
    };
  }
}
