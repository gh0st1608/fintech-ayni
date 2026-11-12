import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Ayuda y política de pagos (COPAYNI-83). Las preguntas iniciales solo usan reglas ya decididas por
 * el PO (pending-scope R3 y R19); el personal las edita desde el back-office. La política de pagos
 * queda vacía hasta que la apruebe Legal (L4).
 */
const SEED: Record<'es' | 'en', [string, string][]> = {
  es: [
    [
      '¿Qué pasa si no pago a tiempo?',
      'Tienes 3 días de gracia desde el vencimiento. Si no pagas, sales de la junta y, para unirte a otra, primero pagas lo vencido más un cargo por mora.',
    ],
    [
      '¿Cuándo recibo mi pozo?',
      'En tu mes de cobro, en cuanto todos los miembros pagan la cuota de ese mes.',
    ],
    [
      '¿Qué pasa si salgo de la junta antes de mi turno?',
      'Te devolvemos las cuotas que pagaste, con una penalidad mínima del 5 %.',
    ],
  ],
  en: [
    [
      'What happens if I pay late?',
      'You have a 3-day grace period after the due date. If you do not pay, you leave the circle and, to join another one, you first pay what is overdue plus a late fee.',
    ],
    [
      'When do I receive my payout?',
      'In your payout month, as soon as every member has paid that month’s installment.',
    ],
    [
      'What happens if I leave the circle before my turn?',
      'We refund the installments you paid, minus a penalty of at least 5%.',
    ],
  ],
};

export class CreateHelpContent1764072000000 implements MigrationInterface {
  name = 'CreateHelpContent1764072000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE help_faqs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        language varchar(8) NOT NULL CHECK (language IN ('es', 'en')),
        position smallint NOT NULL CHECK (position >= 1),
        question varchar(200) NOT NULL CHECK (length(trim(question)) > 0),
        answer varchar(2000) NOT NULL CHECK (length(trim(answer)) > 0),
        CONSTRAINT uq_help_faqs_position UNIQUE (language, position)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE help_documents (
        language varchar(8) PRIMARY KEY CHECK (language IN ('es', 'en')),
        payment_policy text CHECK (payment_policy IS NULL OR length(trim(payment_policy)) > 0),
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by varchar(255) NOT NULL
      )
    `);
    for (const [language, faqs] of Object.entries(SEED)) {
      await queryRunner.query(
        `INSERT INTO help_documents (language, updated_by) VALUES ($1, 'migration')`,
        [language],
      );
      for (const [index, [question, answer]] of faqs.entries()) {
        await queryRunner.query(
          'INSERT INTO help_faqs (language, position, question, answer) VALUES ($1, $2, $3, $4)',
          [language, index + 1, question, answer],
        );
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE help_faqs');
    await queryRunner.query('DROP TABLE help_documents');
  }
}
