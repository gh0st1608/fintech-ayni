import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';

import { type AdminCircleSummary } from '../../../application/ports/admin-circles-query.port';
import { type AdminCircleView } from '../../../application/use-cases/admin-circles.use-cases';
import { CYCLE_STATES, type CycleState } from '../../../domain/entities/circle-cycle';
import { MoneyResponse } from './join-config.response';

export class AdminCirclesQuery {
  @ApiPropertyOptional({ enum: CYCLE_STATES })
  @IsOptional()
  @IsIn(CYCLE_STATES)
  state?: CycleState;

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

export class AdminCircleSummaryResponse {
  @ApiProperty({ format: 'uuid' })
  circleId!: string;

  @ApiProperty({ enum: CYCLE_STATES })
  state!: CycleState;

  @ApiProperty({ type: MoneyResponse })
  payout!: MoneyResponse;

  @ApiProperty()
  months!: number;

  @ApiProperty({ example: '2026-12' })
  startsOn!: string;

  @ApiProperty({ description: 'Miembros vigentes, sin expulsados' })
  members!: number;

  @ApiProperty()
  createdAt!: string;

  static from(circle: AdminCircleSummary): AdminCircleSummaryResponse {
    return {
      circleId: circle.circleId,
      state: circle.state,
      payout: MoneyResponse.from(circle.payout),
      months: circle.months,
      startsOn: circle.startsOn,
      members: circle.members,
      createdAt: circle.createdAt.toISOString(),
    };
  }
}

export class AdminCirclesResponse {
  @ApiProperty({ type: [AdminCircleSummaryResponse] })
  items!: AdminCircleSummaryResponse[];

  @ApiPropertyOptional({ nullable: true, type: String })
  nextCursor!: string | null;
}

class AdminCircleMemberResponse {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty()
  position!: number;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'Juana P.' })
  name!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'j***@mail.com' })
  email!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: '+51******321' })
  phone!: string | null;

  @ApiProperty()
  joinedAt!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  expelledAt!: string | null;
}

class AdminStartProposalResponse {
  @ApiProperty()
  round!: number;

  @ApiProperty({ type: MoneyResponse })
  payout!: MoneyResponse;

  @ApiProperty()
  months!: number;

  @ApiProperty({ example: '2026-11-13' })
  respondBy!: string;

  @ApiProperty()
  accepted!: number;

  @ApiProperty()
  withdrawn!: number;
}

export class AdminCircleDetailResponse extends AdminCircleSummaryResponse {
  @ApiPropertyOptional({ nullable: true, type: String, example: '2026-11' })
  currentPeriod!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: '2026-11-10' })
  pausedOn!: string | null;

  @ApiProperty({ type: [AdminCircleMemberResponse], description: 'Datos personales enmascarados' })
  memberships!: AdminCircleMemberResponse[];

  @ApiPropertyOptional({ nullable: true, type: AdminStartProposalResponse })
  startProposal!: AdminStartProposalResponse | null;

  static fromView(circle: AdminCircleView): AdminCircleDetailResponse {
    return {
      ...AdminCircleSummaryResponse.from(circle),
      currentPeriod: circle.currentPeriod,
      pausedOn: circle.pausedOn,
      memberships: circle.memberships.map((member) => ({
        userId: member.userId,
        position: member.position,
        name: member.name,
        email: member.email,
        phone: member.phone,
        joinedAt: member.joinedAt.toISOString(),
        expelledAt: member.expelledAt?.toISOString() ?? null,
      })),
      startProposal: circle.startProposal
        ? {
            ...circle.startProposal,
            payout: MoneyResponse.from(circle.startProposal.payout),
          }
        : null,
    };
  }
}
