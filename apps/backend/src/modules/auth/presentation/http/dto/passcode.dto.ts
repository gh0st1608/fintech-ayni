import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

/** Supuesto de COPAYNI-23 (pending-scope D9): 6 dígitos. */
const PASSCODE_FORMAT = /^\d{6}$/;

export class PasscodeStatusResponse {
  @ApiProperty({ description: 'Si el usuario ya creó su passcode' })
  configured!: boolean;
}

export class SetPasscodeRequest {
  @ApiPropertyOptional({ description: 'Obligatorio para cambiarlo. 6 dígitos', example: '123456' })
  @IsOptional()
  @IsString()
  @Matches(PASSCODE_FORMAT)
  currentPasscode?: string;

  @ApiProperty({ description: '6 dígitos', example: '654321' })
  @IsString()
  @Matches(PASSCODE_FORMAT)
  newPasscode!: string;
}

export class VerifyPasscodeRequest {
  @ApiProperty({ description: '6 dígitos', example: '123456' })
  @IsString()
  @Matches(PASSCODE_FORMAT)
  passcode!: string;
}
