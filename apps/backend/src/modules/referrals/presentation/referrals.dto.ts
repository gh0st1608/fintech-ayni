import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

import { MoneyResponse } from '../../circles/presentation/http/dto/join-config.response';
import { type MyReferral } from '../application/use-cases/referral.use-cases';

export class MyReferralResponse {
  @ApiProperty({ example: 'K7M2Q9XA' })
  code!: string;

  @ApiProperty({ example: 'ayni://invite?code=K7M2Q9XA', description: 'Deep link de la app' })
  link!: string;

  @ApiProperty({ type: MoneyResponse, description: 'Beneficio para el invitado y para ti' })
  reward!: MoneyResponse;

  static from({ code, link, reward }: MyReferral): MyReferralResponse {
    return { code, link, reward: MoneyResponse.from(reward) };
  }
}

export class ClaimReferralRequest {
  @ApiProperty({ example: 'K7M2Q9XA', description: 'El código del enlace o el que escribió' })
  @IsString()
  @MaxLength(32)
  code!: string;
}

export class ClaimReferralResponse {
  @ApiProperty({ type: MoneyResponse, description: 'Descuento en tu primera cuota' })
  reward!: MoneyResponse;
}
