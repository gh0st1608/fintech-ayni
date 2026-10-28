import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

import { MoneyResponse } from '../../../../circles/presentation/http/dto/join-config.response';
import { type PayoutMethodsView } from '../../../application/use-cases/payout-method.use-cases';
import {
  PAYOUT_METHOD_BADGES,
  PAYOUT_METHOD_TYPES,
  type PayoutMethodBadge,
  type PayoutMethodType,
} from '../../../domain/payout-method';

export class SelectPayoutMethodRequest {
  @ApiProperty({ enum: PAYOUT_METHOD_TYPES, example: 'bank_transfer' })
  @IsString()
  @MaxLength(32)
  method!: string;
}

export class PayoutMethodResponse {
  @ApiProperty({ enum: PAYOUT_METHOD_TYPES })
  type!: PayoutMethodType;

  @ApiProperty({ description: 'false: se muestra deshabilitado ("Not available")' })
  available!: boolean;

  @ApiProperty({ enum: PAYOUT_METHOD_BADGES, isArray: true })
  badges!: PayoutMethodBadge[];

  @ApiProperty({ type: MoneyResponse, nullable: true, description: 'Máximo por payout' })
  limit!: MoneyResponse | null;
}

/** Contrato `GET` y `PUT /v1/me/payout-method` (docs/api/payouts.md). */
export class PayoutMethodsResponse {
  @ApiProperty({ type: [PayoutMethodResponse] })
  methods!: PayoutMethodResponse[];

  @ApiProperty({ enum: PAYOUT_METHOD_TYPES, nullable: true })
  selected!: PayoutMethodType | null;

  static from({ methods, selected }: PayoutMethodsView): PayoutMethodsResponse {
    return {
      methods: methods.map(({ type, available, badges, limit }) => ({
        type,
        available,
        badges: [...badges],
        limit: limit ? MoneyResponse.from(limit) : null,
      })),
      selected,
    };
  }
}
