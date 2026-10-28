import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

import {
  LOGIN_IDENTIFIER_TYPES,
  type LoginIdentifierType,
  type OtpChannel,
} from '../../../../users/domain/value-objects/login-identifier';
import { type ChallengeView } from '../../../application/use-cases/otp.use-cases';
import { type AuthTokens } from '../../../application/services/session-issuer';

export class StartAuthRequest {
  @ApiProperty({ example: 'ana@mail.com', description: 'Email en minúsculas o teléfono E.164' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  identifier!: string;

  @ApiProperty({ enum: LOGIN_IDENTIFIER_TYPES })
  @IsIn(LOGIN_IDENTIFIER_TYPES)
  type!: LoginIdentifierType;
}

export class VerifyOtpRequest {
  @ApiProperty({ example: '0b6c2a4e-3b5d-4c7e-8f90-1a2b3c4d5e6f' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  challengeId!: string;

  @ApiProperty({ example: '1234', description: 'Exactamente 4 dígitos' })
  @Matches(/^\d{4}$/)
  code!: string;
}

export class ResendOtpRequest {
  @ApiProperty({ example: '0b6c2a4e-3b5d-4c7e-8f90-1a2b3c4d5e6f' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  challengeId!: string;
}

export class RefreshTokenRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken!: string;
}

/** Contrato `AuthChallenge` (docs/api/auth.md). */
export class AuthChallengeResponse {
  @ApiProperty()
  challengeId!: string;

  @ApiProperty({ enum: ['email', 'sms'] })
  channel!: OtpChannel;

  @ApiProperty({ example: 'a***@mail.com' })
  maskedDestination!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ format: 'date-time' })
  resendAvailableAt!: string;

  static from(view: ChallengeView): AuthChallengeResponse {
    return {
      ...view,
      expiresAt: view.expiresAt.toISOString(),
      resendAvailableAt: view.resendAvailableAt.toISOString(),
    };
  }
}

export class AuthTokensResponse {
  @ApiProperty({ description: 'JWT ES256 de vida corta' })
  accessToken!: string;

  @ApiProperty({ description: 'Opaco y rotativo: cada renovación devuelve uno nuevo' })
  refreshToken!: string;

  static from({ accessToken, refreshToken }: AuthTokens): AuthTokensResponse {
    return { accessToken, refreshToken };
  }
}
