import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ValidationError } from '../../../../../shared/errors/app-error';
import { isUuid } from '../../../../../shared/infrastructure/persistence/postgres-errors';
import {
  type CycleRun,
  type CycleRunFailure,
  type CycleRunsPort,
} from '../../../application/ports/cycle-runs.port';

interface RunRow {
  id: string;
  business_date: string;
  started_at: Date;
  finished_at: Date;
  advanced: number;
  locked: number;
  failed: number;
  failures: CycleRunFailure[];
  sort_text: string;
}

/** Ejecuciones del ciclo mensual en `circle_cycle_runs`, de la más reciente a la más antigua. */
@Injectable()
export class SqlCycleRuns implements CycleRunsPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async record(run: Omit<CycleRun, 'id'>): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO circle_cycle_runs (business_date, started_at, finished_at, advanced, locked,
                                      failed, failures)
       VALUES ($1::date, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        run.businessDate,
        run.startedAt,
        run.finishedAt,
        run.advanced,
        run.locked,
        run.failed,
        JSON.stringify(run.failures),
      ],
    );
  }

  async list({
    limit,
    cursor,
  }: {
    limit: number;
    cursor: string | null;
  }): Promise<{ items: CycleRun[]; nextCursor: string | null }> {
    let after: { at: string; id: string } | null = null;
    if (cursor) {
      const [at, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
      if (!at || !id || !isUuid(id) || Number.isNaN(Date.parse(at))) {
        throw new ValidationError('El cursor no es válido', { cursor: 'invalid' });
      }
      after = { at, id };
    }
    const rows = await this.dataSource.query<RunRow[]>(
      `SELECT id, to_char(business_date, 'YYYY-MM-DD') AS business_date, started_at, finished_at,
              advanced, locked, failed, failures,
              to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS sort_text
         FROM circle_cycle_runs
        WHERE ($1::timestamptz IS NULL OR (started_at, id) < ($1::timestamptz, $2::uuid))
        ORDER BY started_at DESC, id DESC
        LIMIT $3`,
      [after?.at ?? null, after?.id ?? null, limit + 1],
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: row.id,
        businessDate: row.business_date,
        startedAt: new Date(row.started_at),
        finishedAt: new Date(row.finished_at),
        advanced: row.advanced,
        locked: row.locked,
        failed: row.failed,
        failures: row.failures,
      })),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(`${last.sort_text}|${last.id}`).toString('base64url')
          : null,
    };
  }
}
