import { type CadenceId } from '../../circles/domain/value-objects/cadence';

import { type Notification, type NotificationCategory } from '../domain/notification';
import { type PendingPush } from './push.ports';

export const NOTIFICATIONS = Symbol('NOTIFICATIONS');
export const NOTIFICATION_SETTINGS = Symbol('NOTIFICATION_SETTINGS');

export interface NotificationSettings {
  /** Días antes del vencimiento en que se avisa (además del mismo día). */
  readonly dueSoonDays: number;
  /**
   * Antelación del recordatorio por cadencia, en días (COPAYNI-120). Sin entrada para una
   * cadencia rige `dueSoonDays`, que está calibrado para un ciclo mensual; con 0 no se manda
   * recordatorio previo, solo el del mismo día del vencimiento.
   */
  readonly dueSoonDaysByCadence?: Readonly<Partial<Record<CadenceId, number>>>;
  /** Zona IANA que define "hoy" para los vencimientos. */
  readonly timeZone: string;
}

export interface NotificationsFilter {
  category?: NotificationCategory;
  limit: number;
  cursor: string | null;
}

/**
 * Bandeja de notificaciones. `project` deriva las notificaciones de los hechos ya guardados
 * (cuotas, pagos, pozos, documentos y juntas): es idempotente por la clave única de cada una.
 */
export interface NotificationsPort {
  /** Genera las que falten; `userId` limita a una persona. Devuelve cuántas creó. */
  project(scope: {
    userId?: string;
    today: string;
    dueSoonDays: number;
    dueSoonDaysByCadence?: Readonly<Partial<Record<CadenceId, number>>>;
  }): Promise<number>;
  list(
    userId: string,
    filter: NotificationsFilter,
  ): Promise<{ items: Notification[]; nextCursor: string | null }>;
  unreadCount(userId: string): Promise<number>;
  /** Marca como leídas las indicadas (o todas, sin ids). Solo toca las de la persona. */
  markRead(userId: string, ids: readonly string[] | null, at: Date): Promise<number>;
  /**
   * Notificaciones que todavía no se enviaron al celular (COPAYNI-85), de la más antigua, con el
   * idioma del perfil para escribir el aviso. No devuelve las que agotaron sus intentos.
   */
  pendingPush(props: { limit: number; maxAttempts: number }): Promise<PendingPush[]>;
  /** Marca enviadas las indicadas: enviar es de una sola vez, aunque la tarea se repita. */
  markPushed(ids: readonly string[], at: Date): Promise<number>;
  /** Suma un intento fallido; al llegar a `maxAttempts` la notificación deja de intentarse. */
  markPushAttempt(ids: readonly string[]): Promise<number>;
}
