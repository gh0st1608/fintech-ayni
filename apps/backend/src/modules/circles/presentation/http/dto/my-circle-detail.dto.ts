import { ApiProperty } from '@nestjs/swagger';

import {
  type MyCircleDetail,
  type TurnStatus,
} from '../../../application/use-cases/get-my-circle.use-case';
import { CYCLE_STATES, type CycleState } from '../../../domain/entities/circle-cycle';
import { SLOT_TYPES, type SlotType } from '../../../domain/services/slot-pricing';
import { MoneyResponse } from './join-config.response';

const TURN_STATUSES = ['paid', 'current', 'upcoming', 'vacant'] as const;

export class CircleTurnResponse {
  @ApiProperty({ example: 1 })
  position!: number;

  @ApiProperty({ example: '2026-11', description: 'Mes de cobro de ese turno' })
  period!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'María R.',
    description: 'Nombre abreviado del miembro; null si el turno está vacante o sin nombre',
  })
  memberName!: string | null;

  @ApiProperty({ description: 'true en el turno del usuario' })
  isMe!: boolean;

  @ApiProperty({ enum: TURN_STATUSES })
  status!: TurnStatus;
}

export class NextDueResponse {
  @ApiProperty({ format: 'uuid', description: 'Para pagarla: POST /v1/me/installments/:id/pay' })
  installmentId!: string;

  @ApiProperty({ example: '2026-12' })
  period!: string;

  @ApiProperty({ example: '2026-12-01' })
  dueOn!: string;

  @ApiProperty({ type: MoneyResponse })
  amount!: MoneyResponse;

  @ApiProperty({ enum: ['pending', 'overdue'] })
  status!: 'pending' | 'overdue';
}

/** Contrato de `GET /v1/me/circles/:circleId` (docs/api/circles.md, COPAYNI-88). */
export class MyCircleDetailResponse {
  @ApiProperty({ format: 'uuid' })
  circleId!: string;

  @ApiProperty({ enum: CYCLE_STATES })
  state!: CycleState;

  @ApiProperty({ type: MoneyResponse, description: 'Pozo mensual' })
  payout!: MoneyResponse;

  @ApiProperty({ example: 10 })
  months!: number;

  @ApiProperty({ example: '2026-11' })
  startsOn!: string;

  @ApiProperty({ example: '2027-08' })
  endsOn!: string;

  @ApiProperty({ type: String, nullable: true, example: '2027-01' })
  currentPeriod!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 3,
    description: 'Mes del ciclo en curso (1 a months); null si no empezó',
  })
  currentMonth!: number | null;

  @ApiProperty({ example: 4, description: 'Turno del usuario' })
  position!: number;

  @ApiProperty({ example: '2027-02', description: 'Mes de cobro del usuario' })
  payoutPeriod!: string;

  @ApiProperty({ enum: SLOT_TYPES })
  type!: SlotType;

  @ApiProperty({ type: [MoneyResponse], description: 'Las cuotas del usuario, una por mes' })
  installments!: MoneyResponse[];

  @ApiProperty({ type: MoneyResponse })
  netPayout!: MoneyResponse;

  @ApiProperty({ type: MoneyResponse })
  retention!: MoneyResponse;

  @ApiProperty({ type: NextDueResponse, nullable: true })
  nextDue!: NextDueResponse | null;

  @ApiProperty({ type: [CircleTurnResponse] })
  turns!: CircleTurnResponse[];

  static from(detail: MyCircleDetail): MyCircleDetailResponse {
    const { terms, quote, nextDue } = detail;
    return {
      circleId: detail.circleId,
      state: detail.state,
      payout: MoneyResponse.from(terms.payout),
      months: terms.months,
      startsOn: terms.startsOn.toString(),
      endsOn: terms.endsOn.toString(),
      currentPeriod: detail.currentPeriod?.toString() ?? null,
      currentMonth: detail.currentMonth,
      position: quote.position,
      payoutPeriod: quote.payoutPeriod.toString(),
      type: quote.type,
      installments: quote.installments.map((installment) => MoneyResponse.from(installment)),
      netPayout: MoneyResponse.from(quote.netPayout),
      retention: MoneyResponse.from(quote.retention),
      nextDue: nextDue && {
        installmentId: nextDue.installmentId,
        period: nextDue.period.toString(),
        dueOn: nextDue.dueOn.toString(),
        amount: MoneyResponse.from(nextDue.amount),
        status: nextDue.status,
      },
      turns: detail.turns.map((turn) => ({
        position: turn.position,
        period: turn.period.toString(),
        memberName: turn.memberName,
        isMe: turn.isMe,
        status: turn.status,
      })),
    };
  }
}
