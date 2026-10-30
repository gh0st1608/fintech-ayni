import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

import { type PayInstallmentResult } from '../../../application/use-cases/pay-installment.use-cases';

export class PayInstallmentRequest {
  @ApiProperty({ enum: ['yape', 'card'] })
  @IsIn(['yape', 'card'])
  method!: 'yape' | 'card';

  @ApiProperty({
    required: false,
    description: 'Con yape: el token que genera el SDK de Mercado Pago con el celular y el OTP',
  })
  @ValidateIf((body: PayInstallmentRequest) => body.method === 'yape')
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token?: string;

  @ApiProperty({ required: false, format: 'uuid', description: 'Con card: una tarjeta guardada' })
  @ValidateIf((body: PayInstallmentRequest) => body.method === 'card')
  @IsUUID()
  cardId?: string;
}

/** Contrato de `POST /v1/me/installments/:id/pay` (docs/api/payments.md). */
export class PayInstallmentResponse {
  @ApiProperty({ enum: ['paid', 'pending'], description: 'pending: se confirma por webhook' })
  status!: 'paid' | 'pending';

  @ApiProperty({ description: 'Id del pago en Mercado Pago' })
  paymentId!: string;

  static from(result: PayInstallmentResult): PayInstallmentResponse {
    return { status: result.status, paymentId: result.paymentId };
  }
}
