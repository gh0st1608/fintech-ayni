import { type MigrationInterface, type QueryRunner } from 'typeorm';

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
  'payin_deducted',
];
const list = (values: string[]) => values.map((value) => `'${value}'`).join(', ');

/** Descuento de referidos (COPAYNI-53): el movimiento contable `referral_discount`. */
export class AddReferralDiscount1762948800000 implements MigrationInterface {
  name = 'AddReferralDiscount1762948800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.replaceCheck(queryRunner, [...KINDS, 'referral_discount']);
  }

  /** Falla si ya hay descuentos de referidos registrados. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await this.replaceCheck(queryRunner, KINDS);
  }

  private async replaceCheck(queryRunner: QueryRunner, kinds: string[]): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ledger_transactions
        DROP CONSTRAINT ledger_transactions_kind_check,
        ADD CONSTRAINT ledger_transactions_kind_check CHECK (kind IN (${list(kinds)}))
    `);
  }
}
