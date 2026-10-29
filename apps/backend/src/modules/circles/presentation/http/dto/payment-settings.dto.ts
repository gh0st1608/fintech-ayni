import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

import { type PaymentSettings } from '../../../application/ports/payment-settings.port';

export class UpdatePaymentSettingsRequest {
  @ApiProperty({ description: 'Descontar la cuota del mes de cobro del payout' })
  @IsBoolean()
  deductPayInFromPayout!: boolean;
}

/** Contrato de `GET` y `PATCH /v1/me/payment-settings` (docs/api/payments.md). */
export class PaymentSettingsResponse {
  @ApiProperty({ description: 'false por defecto' })
  deductPayInFromPayout!: boolean;

  static from(settings: PaymentSettings): PaymentSettingsResponse {
    return { deductPayInFromPayout: settings.deductPayInFromPayout };
  }
}
