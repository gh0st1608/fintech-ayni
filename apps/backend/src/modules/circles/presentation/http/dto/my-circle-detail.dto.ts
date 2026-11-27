import { ApiProperty } from '@nestjs/swagger';

import {
  type MyCircleDetail,
  type TurnStatus,
} from '../../../application/use-cases/get-my-circle.use-case';
import { CYCLE_STATES, type CycleState } from '../../../domain/entities/circle-cycle';
import { CADENCE_IDS, type CadenceId } from '../../../domain/value-objects/cadence';
import { SLOT_TYPES, type SlotType } from '../../../domain/services/slot-pricing';
import { MoneyResponse } from './join-config.response';

const TURN_STATUSES = ['paid', 'current', 'upcoming', 'vacant'] as const;

export class CircleTurnResponse {
  @ApiProperty({ example: 1 })
  position!: number;

  @ApiProperty({
    example: 1,
    description:
      'Ordinal del turno (1..turns). Es lo que lo identifica: en una junta semanal hay cuatro ' +
      'turnos en el mismo mes, así que el mes no identifica ninguno (COPAYNI-117)',
  })
  turn!: number;

  @ApiProperty({ example: '2026-11', description: 'Mes de cobro de ese turno' })
  period!: string;

  @ApiProperty({
    example: '2026-11-05',
    description:
      'Día real en que ese turno cobra el pozo (YYYY-MM-DD), calculado por el cronograma del ' +
      'servidor. El cliente lo muestra tal cual: no debe derivar fechas de los meses',
  })
  payoutOn!: string;

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

  @ApiProperty({ example: 10, deprecated: true, description: 'Alias de turnCount' })
  months!: number;

  @ApiProperty({
    example: 10,
    description:
      'Cuántos turnos tiene la junta, que son sus puestos y sus cuotas. Se llama así, y no ' +
      '`turns`, porque ese nombre ya lo ocupa la lista de turnos de este mismo contrato',
  })
  turnCount!: number;

  @ApiProperty({ enum: CADENCE_IDS, description: 'Frecuencia de los turnos' })
  cadence!: CadenceId;

  @ApiProperty({ example: 'Mes', description: 'Cómo se llama un turno: Mes, Quincena o Semana' })
  unit!: string;

  @ApiProperty({ example: '2026-11' })
  startsOn!: string;

  @ApiProperty({
    example: '2026-11-01',
    description:
      'Fecha real del primer turno (YYYY-MM-DD). En cadencia mensual es el día 1 y coincide ' +
      'con startsOn; en las demás es el día que toca, y startsOn solo da su mes (COPAYNI-106).',
  })
  startsOnDate!: string;

  @ApiProperty({ example: '2027-08' })
  endsOn!: string;

  @ApiProperty({
    example: '2027-08-01',
    description:
      'Día real del último turno (YYYY-MM-DD), calculado por el cronograma. En una junta ' +
      'semanal el mes de `endsOn` no dice qué día termina (COPAYNI-117)',
  })
  endsOnDate!: string;

  @ApiProperty({ type: String, nullable: true, example: '2027-01' })
  currentPeriod!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 3,
    deprecated: true,
    description: 'Alias de currentTurn, correcto solo en cadencia mensual; null si no empezó',
  })
  currentMonth!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 3,
    description: 'Turno en curso (1 a turns); null si no empezó (COPAYNI-117)',
  })
  currentTurn!: number | null;

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
      months: terms.turns,
      turnCount: terms.turns,
      cadence: terms.cadence.id,
      unit: terms.cadence.turnLabel(),
      startsOn: terms.startsOnPeriod.toString(),
      startsOnDate: terms.startsOn.toString(),
      endsOn: terms.endsOn.toString(),
      endsOnDate: detail.endsOnDate.toString(),
      currentPeriod: detail.currentPeriod?.toString() ?? null,
      currentMonth: detail.currentMonth,
      currentTurn: detail.currentTurn,
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
        turn: turn.turn,
        period: turn.period.toString(),
        payoutOn: turn.payoutOn.toString(),
        memberName: turn.memberName,
        isMe: turn.isMe,
        status: turn.status,
      })),
    };
  }
}
