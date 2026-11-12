import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import {
  BANK_ACCOUNT_TYPES,
  BANK_CODES,
  type BankAccountType,
  type BankCode,
  maskedLabel,
  type PayoutAccount,
  type PayoutAccountInput,
  PAYOUT_ACCOUNT_KINDS,
  type PayoutAccountKind,
  PERU_BANKS,
  WALLET_PROVIDERS,
  type WalletProvider,
} from '../../../domain/payout-account';

/**
 * `PUT /admin/v1/users/:userId/payout-account`. Los campos dependen de `kind`; el dominio valida
 * la combinación y el dígito de control del CCI. Ni el CCI ni el celular quedan en la auditoría.
 */
export class RegisterPayoutAccountRequest {
  @ApiProperty({ enum: PAYOUT_ACCOUNT_KINDS })
  @IsIn(PAYOUT_ACCOUNT_KINDS)
  kind!: PayoutAccountKind;

  @ApiPropertyOptional({ enum: BANK_CODES, description: 'Con bank_account: código del banco' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  bankCode?: string;

  @ApiPropertyOptional({ enum: BANK_ACCOUNT_TYPES, description: 'Con bank_account' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  accountType?: string;

  @ApiPropertyOptional({ example: '00219300165123456715', description: 'Con bank_account' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  cci?: string;

  @ApiPropertyOptional({ enum: WALLET_PROVIDERS, description: 'Con wallet' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  provider?: string;

  @ApiPropertyOptional({ example: '987654321', description: 'Con wallet: celular de 9 dígitos' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  phone?: string;

  @ApiProperty({ example: 'Juana María Torres Pérez', description: 'Titular, como en el banco' })
  @IsString()
  @MaxLength(160)
  holderName!: string;

  @ApiProperty({ example: 'Constancia de CCI enviada por la persona al soporte' })
  @IsString()
  @Matches(/\S/, { message: 'reason no puede estar vacío' })
  @MaxLength(500)
  reason!: string;

  toInput(): PayoutAccountInput {
    return this.kind === 'bank_account'
      ? {
          kind: 'bank_account',
          bankCode: this.bankCode ?? '',
          accountType: this.accountType ?? '',
          cci: this.cci ?? '',
          holderName: this.holderName,
        }
      : {
          kind: 'wallet',
          provider: this.provider ?? '',
          phone: this.phone ?? '',
          holderName: this.holderName,
        };
  }
}

/** Cuenta enmascarada: nunca lleva el CCI ni el celular completos. */
export class PayoutAccountResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: PAYOUT_ACCOUNT_KINDS })
  kind!: PayoutAccountKind;

  @ApiProperty({ example: 'BCP •••• 1234' })
  label!: string;

  @ApiProperty({ enum: BANK_CODES, nullable: true })
  bankCode!: BankCode | null;

  @ApiProperty({ example: 'BCP', nullable: true })
  bankName!: string | null;

  @ApiProperty({ enum: BANK_ACCOUNT_TYPES, nullable: true })
  accountType!: BankAccountType | null;

  @ApiProperty({ enum: WALLET_PROVIDERS, nullable: true })
  walletProvider!: WalletProvider | null;

  @ApiProperty({ example: '1234' })
  last4!: string;

  @ApiProperty()
  holderName!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  registeredAt!: string;

  static from(account: PayoutAccount): PayoutAccountResponse {
    return {
      id: account.id,
      kind: account.kind,
      label: maskedLabel(account),
      bankCode: account.bankCode,
      bankName: account.bankCode ? PERU_BANKS[account.bankCode] : null,
      accountType: account.accountType,
      walletProvider: account.walletProvider,
      last4: account.last4,
      holderName: account.holderName,
      registeredAt: account.createdAt.toISOString(),
    };
  }
}

/** `GET /v1/me/payout-account`. */
export class MyPayoutAccountResponse {
  @ApiProperty({ type: PayoutAccountResponse, nullable: true })
  account!: PayoutAccountResponse | null;
}

export class AdminPayoutAccountResponse extends PayoutAccountResponse {
  @ApiProperty({ description: 'Id del personal que la registró' })
  registeredBy!: string;

  @ApiProperty({ nullable: true })
  registeredByEmail!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  replacedAt!: string | null;

  static fromAccount(account: PayoutAccount): AdminPayoutAccountResponse {
    return {
      ...PayoutAccountResponse.from(account),
      registeredBy: account.registeredBy,
      registeredByEmail: account.registeredByEmail,
      replacedAt: account.replacedAt?.toISOString() ?? null,
    };
  }
}

/** `GET /admin/v1/users/:userId/payout-account`. */
export class AdminPayoutAccountsResponse {
  @ApiProperty({ type: AdminPayoutAccountResponse, nullable: true })
  current!: AdminPayoutAccountResponse | null;

  @ApiProperty({
    type: [AdminPayoutAccountResponse],
    description: 'De la más reciente a la más antigua',
  })
  history!: AdminPayoutAccountResponse[];

  @ApiProperty({
    description: 'Bancos admitidos, por código (los 3 primeros dígitos del CCI)',
    example: { '002': 'BCP' },
  })
  banks!: Record<string, string>;
}
