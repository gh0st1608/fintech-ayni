import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource } from 'typeorm';

import { Period } from '../../../../shared/domain/value-objects/period';
import {
  type PayoutMethodRepositoryPort,
  type PayoutSchedulePort,
} from '../../application/ports/payout.ports';
import { type PayoutMethodType } from '../../domain/payout-method';
import { turnMonthSql } from '../../../circles/infrastructure/persistence/typeorm/turn-date.sql';

/** Método elegido por usuario, en `user_payout_methods`. */
@Injectable()
export class SqlPayoutMethodRepository implements PayoutMethodRepositoryPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async selectedBy(userId: string): Promise<PayoutMethodType | null> {
    const rows = await this.dataSource.query<{ method: PayoutMethodType }[]>(
      'SELECT method FROM user_payout_methods WHERE user_id::text = $1',
      [userId],
    );
    return rows[0]?.method ?? null;
  }

  async select(userId: string, type: PayoutMethodType): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO user_payout_methods (user_id, method) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET method = EXCLUDED.method, updated_at = now()`,
      [userId, type],
    );
  }
}

/**
 * Meses de cobro del usuario: lectura sobre las tablas de círculos. El día del turno lo da la
 * cadencia de cada junta (`turnDateSql`, COPAYNI-120); sumar meses a la posición solo acierta en
 * cadencia mensual, y de este dato depende que no se pueda cambiar la cuenta de cobro en el mes
 * en que se cobra. Es una consulta de solo lectura; las escrituras de círculos siguen en su módulo.
 */
@Injectable()
export class SqlPayoutSchedule implements PayoutSchedulePort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async payoutPeriodsOf(userId: string): Promise<Period[]> {
    const rows = await this.dataSource.query<{ period: string }[]>(
      `SELECT to_char(${turnMonthSql('c', 'm.position')}, 'YYYY-MM') AS period
         FROM circle_memberships m
         JOIN circles c ON c.id = m.circle_id
        WHERE m.user_id::text = $1`,
      [userId],
    );
    return rows.map(({ period }) => Period.parse(period));
  }
}
