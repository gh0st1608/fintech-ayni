import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { type NotificationPreferencesPort, type PushDevicesPort } from '../application/push.ports';
import {
  DEFAULT_PREFERENCES,
  type NotificationPreferences,
} from '../domain/notification-preferences';
import {
  type DeviceDisabledReason,
  type DevicePlatform,
  type PushDevice,
} from '../domain/push-device';

interface DeviceRow {
  id: string;
  token: string;
  platform: DevicePlatform;
  last_seen_at: Date;
}

const toDevice = (row: DeviceRow): PushDevice => ({
  id: row.id,
  token: row.token,
  platform: row.platform,
  lastSeenAt: new Date(row.last_seen_at),
});

/** Dispositivos donde la persona recibe los avisos (COPAYNI-85). */
@Injectable()
export class SqlPushDevicesRepository implements PushDevicesPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async register(props: {
    userId: string;
    token: string;
    platform: DevicePlatform;
  }): Promise<PushDevice> {
    /**
     * El token identifica la instalación, así que es único en todo el sistema: si vuelve con otra
     * cuenta (alguien más inicia sesión en ese celular) cambia de dueño, y si estaba apagado por
     * un cierre de sesión vuelve a quedar activo.
     */
    const rows = await this.dataSource.query<DeviceRow[]>(
      `INSERT INTO user_push_devices (user_id, token, platform)
            VALUES ($1::uuid, $2, $3)
       ON CONFLICT (token) DO UPDATE
              SET user_id = EXCLUDED.user_id,
                  platform = EXCLUDED.platform,
                  last_seen_at = now(),
                  disabled_at = NULL,
                  disabled_reason = NULL
        RETURNING id, token, platform, last_seen_at`,
      [props.userId, props.token, props.platform],
    );
    return toDevice(rows[0]!);
  }

  async activeOf(userId: string): Promise<PushDevice[]> {
    const rows = await this.dataSource.query<DeviceRow[]>(
      `SELECT id, token, platform, last_seen_at
         FROM user_push_devices
        WHERE user_id = $1::uuid AND disabled_at IS NULL
        ORDER BY last_seen_at DESC`,
      [userId],
    );
    return rows.map(toDevice);
  }

  async disable(token: string, reason: DeviceDisabledReason, at: Date): Promise<boolean> {
    const [, updated] = await this.dataSource.query<[unknown[], number]>(
      `UPDATE user_push_devices SET disabled_at = $2, disabled_reason = $3
        WHERE token = $1 AND disabled_at IS NULL`,
      [token, at, reason],
    );
    return updated > 0;
  }
}

interface PreferencesRow {
  push_enabled: boolean;
  payments: boolean;
  circles: boolean;
  account: boolean;
}

/** Preferencias de aviso; quien nunca las tocó no tiene fila y recibe todo. */
@Injectable()
export class SqlNotificationPreferencesRepository implements NotificationPreferencesPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async of(userId: string): Promise<NotificationPreferences> {
    const rows = await this.dataSource.query<PreferencesRow[]>(
      `SELECT push_enabled, payments, circles, account
         FROM notification_preferences WHERE user_id = $1::uuid`,
      [userId],
    );
    const row = rows[0];
    if (!row) return DEFAULT_PREFERENCES;
    return {
      pushEnabled: row.push_enabled,
      categories: { payments: row.payments, circles: row.circles, account: row.account },
    };
  }

  async save(userId: string, preferences: NotificationPreferences, at: Date): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO notification_preferences
              (user_id, push_enabled, payments, circles, account, updated_at)
            VALUES ($1::uuid, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE
              SET push_enabled = EXCLUDED.push_enabled,
                  payments = EXCLUDED.payments,
                  circles = EXCLUDED.circles,
                  account = EXCLUDED.account,
                  updated_at = EXCLUDED.updated_at`,
      [
        userId,
        preferences.pushEnabled,
        preferences.categories.payments,
        preferences.categories.circles,
        preferences.categories.account,
        at,
      ],
    );
  }
}
