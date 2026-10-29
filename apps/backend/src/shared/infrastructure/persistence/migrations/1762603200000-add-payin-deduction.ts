import { type MigrationInterface, type QueryRunner } from 'typeorm';

const STATUSES = ['pending', 'paid', 'overdue', 'defaulted', 'retained'];
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
  'retention_held',
  'retention_applied',
  'retention_to_fund',
];
const list = (values: string[]) => values.map((value) => `'${value}'`).join(', ');

/**
 * Deducción del pay-in desde el payout (COPAYNI-38): la preferencia del usuario, la cuota
 * `deducted` y el movimiento contable `payin_deducted`.
 */
export class AddPayinDeduction1762603200000 implements MigrationInterface {
  name = 'AddPayinDeduction1762603200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE member_payment_settings (
        user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        deduct_pay_in_from_payout boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.replaceChecks(queryRunner, [...STATUSES, 'deducted'], [...KINDS, 'payin_deducted']);
  }

  /** Falla si ya hay cuotas descontadas o movimientos de deducción. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await this.replaceChecks(queryRunner, STATUSES, KINDS);
    await queryRunner.query('DROP TABLE member_payment_settings');
  }

  private async replaceChecks(
    queryRunner: QueryRunner,
    statuses: string[],
    kinds: string[],
  ): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE circle_installments
        DROP CONSTRAINT circle_installments_status_check,
        ADD CONSTRAINT circle_installments_status_check CHECK (status IN (${list(statuses)}))
    `);
    await queryRunner.query(`
      ALTER TABLE ledger_transactions
        DROP CONSTRAINT ledger_transactions_kind_check,
        ADD CONSTRAINT ledger_transactions_kind_check CHECK (kind IN (${list(kinds)}))
    `);
  }
}
