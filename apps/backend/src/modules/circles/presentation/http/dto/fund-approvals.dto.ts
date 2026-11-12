import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

import {
  APPROVAL_ACTIONS,
  APPROVAL_STATUSES,
  type ApprovalAction,
  type ApprovalStatus,
  FUND_MOVEMENT_KINDS,
  type FundMovementKind,
  type StaffActor,
  type StaffApproval,
} from '../../../domain/staff-approval';
import { FinancePageQuery } from './admin-finance.dto';

/** `POST /admin/v1/guarantee-fund/movements`. */
export class ProposeFundMovementRequest {
  @ApiProperty({ enum: FUND_MOVEMENT_KINDS })
  @IsIn(FUND_MOVEMENT_KINDS)
  kind!: FundMovementKind;

  @ApiProperty({
    example: 5_000_000,
    description: 'Unidades menores. Positivo entra al fondo; negativo (solo adjustment) sale',
  })
  @IsInt()
  amount!: number;

  @ApiProperty({ example: 'PEN' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiProperty({ example: 'Capital semilla aprobado en el acta 2026-11' })
  @IsString()
  @Matches(/\S/, { message: 'reason no puede estar vacío' })
  @MaxLength(500)
  reason!: string;
}

export class RejectApprovalRequest {
  @ApiProperty({ example: 'El monto no coincide con el acta' })
  @IsString()
  @Matches(/\S/, { message: 'reason no puede estar vacío' })
  @MaxLength(500)
  reason!: string;
}

export class ApprovalsQuery extends FinancePageQuery {
  @ApiPropertyOptional({ enum: APPROVAL_STATUSES })
  @IsOptional()
  @IsIn(APPROVAL_STATUSES)
  status?: ApprovalStatus;
}

class StaffActorResponse {
  @ApiProperty()
  staffId!: string;

  @ApiProperty({ nullable: true })
  email!: string | null;
}

class FundMovementProposalResponse {
  @ApiProperty({ enum: FUND_MOVEMENT_KINDS })
  kind!: FundMovementKind;

  @ApiProperty({ example: { amount: 5_000_000, currency: 'PEN' } })
  amount!: { amount: number; currency: string };

  @ApiProperty()
  reason!: string;
}

export class ApprovalResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: APPROVAL_ACTIONS })
  action!: ApprovalAction;

  @ApiProperty({ type: FundMovementProposalResponse })
  movement!: FundMovementProposalResponse;

  @ApiProperty({ enum: APPROVAL_STATUSES })
  status!: ApprovalStatus;

  @ApiProperty({ type: StaffActorResponse })
  proposedBy!: StaffActorResponse;

  @ApiProperty({ type: String, format: 'date-time' })
  proposedAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ type: StaffActorResponse, nullable: true })
  decidedBy!: StaffActorResponse | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  decidedAt!: string | null;

  @ApiProperty({ nullable: true, description: 'Motivo del rechazo' })
  decisionReason!: string | null;

  static from(approval: StaffApproval): ApprovalResponse {
    const copy = (who: StaffActor): StaffActorResponse => ({
      staffId: who.staffId,
      email: who.email,
    });
    return {
      id: approval.id,
      action: approval.action,
      movement: {
        kind: approval.payload.kind,
        amount: { amount: approval.payload.amount, currency: approval.payload.currency },
        reason: approval.payload.reason,
      },
      status: approval.status,
      proposedBy: copy(approval.proposedBy),
      proposedAt: approval.proposedAt.toISOString(),
      expiresAt: approval.expiresAt.toISOString(),
      decidedBy: approval.decidedBy ? copy(approval.decidedBy) : null,
      decidedAt: approval.decidedAt?.toISOString() ?? null,
      decisionReason: approval.decisionReason,
    };
  }
}

export class ApprovalsResponse {
  @ApiProperty({ type: [ApprovalResponse] })
  items!: ApprovalResponse[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
