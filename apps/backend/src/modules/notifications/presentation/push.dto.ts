import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

import { type NotificationPreferences } from '../domain/notification-preferences';
import { DEVICE_PLATFORMS, type DevicePlatform, type PushDevice } from '../domain/push-device';

export class RegisterDeviceRequest {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  token!: string;

  @ApiProperty({ enum: DEVICE_PLATFORMS })
  @IsIn(DEVICE_PLATFORMS)
  platform!: DevicePlatform;
}

export class RegisterDeviceResponse {
  @ApiProperty({ format: 'uuid' })
  deviceId!: string;

  @ApiProperty({ enum: DEVICE_PLATFORMS })
  platform!: DevicePlatform;

  static from(device: PushDevice): RegisterDeviceResponse {
    // El token no se devuelve: la app ya lo tiene y no hace falta repetirlo.
    return { deviceId: device.id, platform: device.platform };
  }
}

/** Categorías de la bandeja; apagarlas solo evita el aviso en el celular. */
export class PreferenceCategoriesDto {
  @ApiPropertyOptional({ description: 'Cuotas, pagos y cobros' })
  @IsOptional()
  @IsBoolean()
  payments?: boolean;

  @ApiPropertyOptional({ description: 'Cambios de las juntas' })
  @IsOptional()
  @IsBoolean()
  circles?: boolean;

  @ApiPropertyOptional({ description: 'Documentos y verificación de identidad' })
  @IsOptional()
  @IsBoolean()
  account?: boolean;
}

/** Cambio parcial: lo que no se envía queda como estaba. */
export class UpdatePreferencesRequest {
  @ApiPropertyOptional({ description: 'Con false no se envía ningún aviso al celular' })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional({ type: PreferenceCategoriesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PreferenceCategoriesDto)
  categories?: PreferenceCategoriesDto;
}

export class PreferencesResponse {
  @ApiProperty()
  pushEnabled!: boolean;

  @ApiProperty({ type: PreferenceCategoriesDto })
  categories!: { payments: boolean; circles: boolean; account: boolean };

  static from(preferences: NotificationPreferences): PreferencesResponse {
    return {
      pushEnabled: preferences.pushEnabled,
      categories: { ...preferences.categories },
    };
  }
}
