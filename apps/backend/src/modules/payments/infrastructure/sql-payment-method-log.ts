import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { type PaymentMethodLogPort } from '../application/ports/payment-method-log.port';

/** El último método con que se cobró (o se intenta cobrar) cada cuota. */
@Injectable()
export class SqlPaymentMethodLog implements PaymentMethodLogPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async record(installmentId: string, label: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO installment_payment_methods (installment_id, label) VALUES ($1, $2)
       ON CONFLICT (installment_id) DO UPDATE SET label = EXCLUDED.label, recorded_at = now()`,
      [installmentId, label],
    );
  }
}
