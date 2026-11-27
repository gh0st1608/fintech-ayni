import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { isUuid } from '../../../../../shared/infrastructure/persistence/postgres-errors';
import {
  type MyCircleCalendar,
  type MyCircleCalendarPort,
} from '../../../application/ports/my-circle-calendar.port';
import { type CycleState } from '../../../domain/entities/circle-cycle';

/** Estado, miembros vigentes y payouts pagados de un círculo, para el detalle de un miembro. */
@Injectable()
export class SqlMyCircleCalendarQuery implements MyCircleCalendarPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async find(circleId: string): Promise<MyCircleCalendar | null> {
    if (!isUuid(circleId)) return null;
    const [circle] = await this.dataSource.query<
      { cycle_state: CycleState; current_period: string | null; current_turn: number | null }[]
    >(
      `SELECT cycle_state, to_char(current_period, 'YYYY-MM') AS current_period, current_turn
         FROM circles WHERE id = $1`,
      [circleId],
    );
    if (!circle) return null;
    const [members, payouts] = await Promise.all([
      this.dataSource.query<
        { user_id: string; position: number; first_name: string | null; last_name: string | null }[]
      >(
        `SELECT m.user_id, m.position, u.first_name, u.last_name
           FROM circle_memberships m JOIN users u ON u.id = m.user_id
          WHERE m.circle_id = $1 AND m.expelled_at IS NULL
          ORDER BY m.position`,
        [circleId],
      ),
      // Por turno, no por mes: en una junta semanal cuatro payouts caen en el mismo mes
      // (COPAYNI-117). La columna la llenó la expansión y la fijó la contracción (COPAYNI-109).
      this.dataSource.query<{ turn: number }[]>(
        `SELECT turn FROM circle_payouts WHERE circle_id = $1 ORDER BY turn`,
        [circleId],
      ),
    ]);
    return {
      state: circle.cycle_state,
      currentPeriod: circle.current_period,
      currentTurn: circle.current_turn === null ? null : Number(circle.current_turn),
      members: members.map((member) => ({
        userId: member.user_id,
        position: Number(member.position),
        firstName: member.first_name,
        lastName: member.last_name,
      })),
      paidTurns: payouts.map(({ turn }) => Number(turn)),
    };
  }
}
