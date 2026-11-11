import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

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

  @ApiProperty({
    required: false,
    example: '987654321',
    description:
      'Con yape: el celular con el que se generó el token (9 dígitos; acepta +51). Si falta, se ' +
      'usa el del perfil. Nunca se envía el OTP.',
  })
  @ValidateIf((body: PayInstallmentRequest) => body.method === 'yape')
  @IsOptional()
  @Matches(/^(\+?51)?\d{9}$/)
  phoneNumber?: string;

  @ApiProperty({
    required: false,
    example: '12345678',
    description: 'Con yape, opcional: el DNI del pagador (8 dígitos), que Mercado Pago pide',
  })
  @ValidateIf((body: PayInstallmentRequest) => body.method === 'yape')
  @IsOptional()
  @Matches(/^\d{8}$/)
  documentNumber?: string;

  @ApiProperty({ required: false, format: 'uuid', description: 'Con card: una tarjeta guardada' })
  @ValidateIf((body: PayInstallmentRequest) => body.method === 'card')
  @IsUUID()
  cardId?: string;
}

/** Contrato de `POST /v1/me/installments/:id/pay` (docs/api/payments.md). */
export class PayInstallmentResponse {
  @ApiProperty({ enum: ['paid', 'pending'], description: 'pending: se confirma por webhook' })
  status!: 'paid' | 'pending';

  @ApiProperty({
    description: 'Número de operación: id del pago (tarjeta) o de la orden (Yape) en Mercado Pago',
  })
  paymentId!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Cuándo quedó pagada, para el recibo; null mientras está en proceso',
  })
  paidAt!: string | null;

  static from(result: PayInstallmentResult): PayInstallmentResponse {
    return {
      status: result.status,
      paymentId: result.paymentId,
      paidAt: result.paidAt?.toISOString() ?? null,
    };
  }
}
