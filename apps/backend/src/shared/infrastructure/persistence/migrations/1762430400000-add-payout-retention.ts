import { type MigrationInterface, type QueryRunner } from 'typeorm';

const STATUSES = ['pending', 'paid', 'overdue', 'defaulted'];
const ACCOUNTS = [
  'circle_pot',
  'guarantee_fund',
  'operator',
  'member_payable',
  'refunds_payable',
  'external',
];
const KINDS = [
  'collection',
  'coverage',
  'payout',
  'operator_residual',
  'fund_contribution',
  'pot_returned',
  'fund_debt_to_member',
  'refund_due',
  'penalty',
  'refund_paid',
  'debt_recovered',
  'seed_capital',
  'adjustment',
];
const RETENTION_KINDS = ['retention_held', 'retention_applied', 'retention_to_fund'];
const list = (values: string[]) => values.map((value) => `'${value}'`).join(', ');

/**
 * Retención del payout (COPAYNI-60): la cuota que paga la retención queda `retained`, y el
 * registro contable suma la cuenta `retention_held` y sus movimientos.
 */
export class AddPayoutRetention1762430400000 implements MigrationInterface {
  name = 'AddPayoutRetention1762430400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.replaceChecks(
      queryRunner,
      [...STATUSES, 'retained'],
      [...ACCOUNTS, 'retention_held'],
      [...KINDS, ...RETENTION_KINDS],
    );
  }

  /** Falla si ya hay cuotas retenidas o movimientos de retención. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await this.replaceChecks(queryRunner, STATUSES, ACCOUNTS, KINDS);
  }

  private async replaceChecks(
    queryRunner: QueryRunner,
    statuses: string[],
    accounts: string[],
    kinds: string[],
  ): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE circle_installments
        DROP CONSTRAINT circle_installments_status_check,
        ADD CONSTRAINT circle_installments_status_check CHECK (status IN (${list(statuses)}))
    `);
    await queryRunner.query(`
      ALTER TABLE ledger_entries
        DROP CONSTRAINT ledger_entries_account_check,
        ADD CONSTRAINT ledger_entries_account_check CHECK (account IN (${list(accounts)}))
    `);
    await queryRunner.query(`
      ALTER TABLE ledger_transactions
        DROP CONSTRAINT ledger_transactions_kind_check,
        ADD CONSTRAINT ledger_transactions_kind_check CHECK (kind IN (${list(kinds)}))
    `);
  }
}
