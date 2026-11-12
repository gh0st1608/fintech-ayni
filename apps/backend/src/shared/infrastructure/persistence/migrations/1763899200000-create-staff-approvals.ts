import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Doble aprobación del personal (COPAYNI-73, docs/backoffice-plan.md §4). Una propuesta guarda la
 * acción y sus datos tal como se aprobarán; quien decide no puede ser quien propuso (lo valida la
 * aplicación y, además, esta restricción sobre el id del personal).
 */
export class CreateStaffApprovals1763899200000 implements MigrationInterface {
  name = 'CreateStaffApprovals1763899200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE staff_approvals (
        id uuid PRIMARY KEY,
        action varchar(48) NOT NULL CHECK (action IN ('guarantee_fund.movement')),
        payload jsonb NOT NULL,
        status varchar(16) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
        proposed_by varchar(128) NOT NULL,
        proposed_by_email varchar(254),
        proposed_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        decided_by varchar(128),
        decided_by_email varchar(254),
        decided_at timestamptz,
        decision_reason varchar(500),
        CONSTRAINT ck_staff_approvals_decided CHECK (
          (status = 'pending' AND decided_by IS NULL AND decided_at IS NULL)
          OR (status <> 'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
        ),
        CONSTRAINT ck_staff_approvals_four_eyes CHECK (decided_by IS NULL OR decided_by <> proposed_by),
        CONSTRAINT ck_staff_approvals_expiry CHECK (expires_at > proposed_at)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_staff_approvals_recent ON staff_approvals (proposed_at DESC, id DESC)',
    );
    await queryRunner.query(
      `CREATE INDEX ix_staff_approvals_pending ON staff_approvals (expires_at)
        WHERE status = 'pending'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE staff_approvals');
  }
}
