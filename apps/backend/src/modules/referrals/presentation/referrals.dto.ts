import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { MoneyResponse } from '../../circles/presentation/http/dto/join-config.response';
import { type InviteeStatus } from '../application/ports/referral-repository.port';
import { type MyReferral, type ReferralSummary } from '../application/use-cases/referral.use-cases';

export class ReferralsQuery {
  @ApiProperty({ required: false, description: 'nextCursor de la página anterior' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiProperty({ required: false, minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class InviteeResponse {
  @ApiProperty({ example: 'Ana Q.', description: 'Nombre minimizado o contacto enmascarado' })
  displayName!: string;

  @ApiProperty({ enum: ['registered', 'joined_circle', 'first_pay_in_paid'] })
  status!: InviteeStatus;

  @ApiProperty({ example: '2026-11-02T15:00:00.000Z' })
  claimedAt!: string;
}

/** Contrato de `GET /v1/me/referrals` (docs/api/referrals.md). */
export class ReferralSummaryResponse {
  @ApiProperty({ type: MoneyResponse })
  earned!: MoneyResponse;

  @ApiProperty({ type: MoneyResponse })
  redeemed!: MoneyResponse;

  @ApiProperty({ type: MoneyResponse, description: 'Se descuenta solo en la próxima cuota' })
  balance!: MoneyResponse;

  @ApiProperty({ type: [InviteeResponse] })
  invitees!: InviteeResponse[];

  @ApiProperty({ nullable: true, type: String })
  nextCursor!: string | null;

  static from(summary: ReferralSummary): ReferralSummaryResponse {
    return {
      earned: MoneyResponse.from(summary.earned),
      redeemed: MoneyResponse.from(summary.redeemed),
      balance: MoneyResponse.from(summary.balance),
      invitees: summary.invitees.items.map((invitee) => ({
        displayName: invitee.displayName,
        status: invitee.status,
        claimedAt: invitee.claimedAt.toISOString(),
      })),
      nextCursor: summary.invitees.nextCursor,
    };
  }
}

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
