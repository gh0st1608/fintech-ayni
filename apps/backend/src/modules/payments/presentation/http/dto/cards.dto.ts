import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { type SavedCard } from '../../../application/ports/saved-card-repository.port';

export class AddCardRequest {
  @ApiProperty({
    description: 'Token de un solo uso del SDK de Mercado Pago. Nunca el número ni el CVC',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token!: string;
}

/** Contrato de una tarjeta guardada (docs/api/payments.md). */
export class SavedCardResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'visa', description: 'Marca de Mercado Pago (visa, master, amex…)' })
  brand!: string;

  @ApiProperty({ example: '0215' })
  lastFour!: string;

  @ApiProperty({ example: 11 })
  expirationMonth!: number;

  @ApiProperty({ example: 2029 })
  expirationYear!: number;

  @ApiProperty({ description: 'Con la que se cobran las cuotas' })
  isDefault!: boolean;

  static from(card: SavedCard): SavedCardResponse {
    const { id, brand, lastFour, expirationMonth, expirationYear, isDefault } = card;
    return { id, brand, lastFour, expirationMonth, expirationYear, isDefault };
  }
}

export class SavedCardsResponse {
  @ApiProperty({ type: [SavedCardResponse], description: 'La predeterminada primero' })
  items!: SavedCardResponse[];

  static from(cards: SavedCard[]): SavedCardsResponse {
    return { items: cards.map((card) => SavedCardResponse.from(card)) };
  }
}
