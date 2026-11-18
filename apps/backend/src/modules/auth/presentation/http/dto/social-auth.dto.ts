import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import {
  type ExternalIdentity,
  IDENTITY_PROVIDERS,
  type IdentityProvider,
} from '../../../domain/entities/external-identity';

/** Tope de un ID token; muy por encima de lo que emiten Google y Apple. */
const MAX_TOKEN = 4096;

export class SocialLoginRequest {
  @ApiProperty({ description: 'ID Token del proveedor (JWT)', maxLength: MAX_TOKEN })
  @IsString()
  @MinLength(16)
  @MaxLength(MAX_TOKEN)
  idToken!: string;

  @ApiProperty({
    description: 'El nonce que la app generó para este intento; siempre se exige',
    maxLength: 128,
  })
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  nonce!: string;
}

export class AppleCallbackRequest {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  state!: string;

  @ApiPropertyOptional({ description: 'Código de autorización de Apple' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TOKEN)
  code?: string;

  @ApiPropertyOptional({ description: 'Apple lo envía en el form_post cuando hay scopes' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TOKEN)
  id_token?: string;

  @ApiPropertyOptional({ description: 'Apple avisa aquí si la persona canceló' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  error?: string;
}

/**
 * Vuelta de Google: llega por GET con los parámetros en la query, que es como redirige Google.
 * El `code` nunca se registra en logs ni se devuelve a la app.
 */
export class GoogleCallbackQuery {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  state!: string;

  @ApiPropertyOptional({ description: 'Código de autorización de Google' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TOKEN)
  code?: string;

  @ApiPropertyOptional({ description: 'Google avisa aquí si la persona canceló' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  error?: string;
}

export class ExchangeSocialCodeRequest {
  @ApiProperty({ description: 'Código interno de un solo uso que la app recibió por deep link' })
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  code!: string;
}

export class SocialAuthorizeResponse {
  @ApiProperty({ description: 'URL del proveedor que la app abre en el navegador del sistema' })
  authorizationUrl!: string;

  @ApiProperty({ description: 'Identifica el intento; la app no necesita guardarlo' })
  state!: string;
}

export class SocialIdentityResponse {
  @ApiProperty({ enum: IDENTITY_PROVIDERS })
  provider!: IdentityProvider;

  @ApiProperty({ nullable: true, description: 'El correo que dio el proveedor al vincular' })
  email!: string | null;

  @ApiProperty()
  linkedAt!: string;

  @ApiProperty({ nullable: true })
  lastLoginAt!: string | null;

  static from(identity: ExternalIdentity): SocialIdentityResponse {
    return {
      provider: identity.provider,
      email: identity.email,
      linkedAt: identity.createdAt.toISOString(),
      lastLoginAt: identity.lastLoginAt ? identity.lastLoginAt.toISOString() : null,
    };
  }
}

export class SocialIdentitiesResponse {
  @ApiProperty({ type: [SocialIdentityResponse] })
  identities!: SocialIdentityResponse[];

  static from(identities: readonly ExternalIdentity[]): SocialIdentitiesResponse {
    return { identities: identities.map((identity) => SocialIdentityResponse.from(identity)) };
  }
}

/** Proveedor en la ruta; una lista cerrada evita que llegue cualquier cosa al dominio. */
export class ProviderParam {
  @ApiProperty({ enum: IDENTITY_PROVIDERS })
  @IsIn(IDENTITY_PROVIDERS)
  provider!: IdentityProvider;
}
