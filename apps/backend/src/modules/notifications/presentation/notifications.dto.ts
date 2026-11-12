import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  type Notification,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
  type NotificationCategory,
  type NotificationData,
  type NotificationType,
} from '../domain/notification';

export class NotificationsQuery {
  @ApiPropertyOptional({ enum: NOTIFICATION_CATEGORIES, description: 'Sin valor: todas' })
  @IsOptional()
  @IsIn(NOTIFICATION_CATEGORIES)
  category?: NotificationCategory;

  @ApiPropertyOptional({ description: 'nextCursor de la página anterior' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/** Sin `ids` marca todas como leídas. */
export class MarkNotificationsReadRequest {
  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids?: string[];
}

export class NotificationResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: NOTIFICATION_TYPES })
  type!: NotificationType;

  @ApiProperty({ enum: NOTIFICATION_CATEGORIES })
  category!: NotificationCategory;

  @ApiProperty({
    description:
      'Datos para el mensaje y el destino: circleId, amount, dueOn, period, documentType',
    example: { circleId: '6f1c…', amount: { amount: 50000, currency: 'PEN' }, dueOn: '2026-12-01' },
  })
  data!: NotificationData;

  @ApiProperty({ type: String, format: 'date-time' })
  occurredAt!: string;

  @ApiProperty()
  read!: boolean;

  static from(notification: Notification): NotificationResponse {
    return {
      id: notification.id,
      type: notification.type,
      category: notification.category,
      data: notification.data,
      occurredAt: notification.occurredAt.toISOString(),
      read: notification.readAt !== null,
    };
  }
}

export class NotificationsResponse {
  @ApiProperty({ type: [NotificationResponse] })
  items!: NotificationResponse[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;

  @ApiProperty({ description: 'No leídas, en todas las categorías' })
  unread!: number;
}

export class UnreadCountResponse {
  @ApiProperty()
  unread!: number;
}
