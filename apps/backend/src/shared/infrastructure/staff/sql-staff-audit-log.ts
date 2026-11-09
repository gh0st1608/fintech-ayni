import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import {
  type StaffAuditEntry,
  type StaffAuditPort,
} from '../../application/ports/staff-audit.port';

/** StaffAuditPort sobre `staff_audit_log`, de solo inserción. */
@Injectable()
export class SqlStaffAuditLog implements StaffAuditPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async record(entry: StaffAuditEntry): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO staff_audit_log
         (actor_id, actor_email, action, entity, entity_id, outcome, details, trace_id, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entry.actorId,
        entry.actorEmail ?? null,
        entry.action,
        entry.entity,
        entry.entityId ?? null,
        entry.outcome,
        JSON.stringify(entry.details),
        entry.traceId ?? null,
        entry.ip ?? null,
      ],
    );
  }
}
