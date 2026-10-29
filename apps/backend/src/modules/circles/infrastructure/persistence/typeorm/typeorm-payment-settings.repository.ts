import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';

import { isUuid } from '../../../../../shared/infrastructure/persistence/postgres-errors';
import {
  type PaymentSettings,
  type PaymentSettingsPort,
} from '../../../application/ports/payment-settings.port';
import { CircleEntity } from './circle.entity';

const DEFAULTS: PaymentSettings = { deductPayInFromPayout: false };

/** PaymentSettingsPort sobre PostgreSQL (`member_payment_settings`). */
@Injectable()
export class TypeOrmPaymentSettings implements PaymentSettingsPort {
  constructor(@InjectRepository(CircleEntity) private readonly circles: Repository<CircleEntity>) {}

  async get(userId: string): Promise<PaymentSettings> {
    if (!isUuid(userId)) return { ...DEFAULTS };
    const [row] = await this.circles.query<{ deduct: boolean }[]>(
      'SELECT deduct_pay_in_from_payout AS deduct FROM member_payment_settings WHERE user_id = $1',
      [userId],
    );
    return row ? { deductPayInFromPayout: row.deduct } : { ...DEFAULTS };
  }

  async save(userId: string, settings: PaymentSettings): Promise<void> {
    await this.circles.query(
      `INSERT INTO member_payment_settings (user_id, deduct_pay_in_from_payout)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
         SET deduct_pay_in_from_payout = EXCLUDED.deduct_pay_in_from_payout, updated_at = now()`,
      [userId, settings.deductPayInFromPayout],
    );
  }
}
