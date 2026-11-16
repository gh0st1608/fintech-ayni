import { Logger } from '@nestjs/common';

import { type PushResult, type PushSenderPort } from '../application/push.ports';
import { type PushDevice } from '../domain/push-device';
import { type PushMessage } from '../domain/push-message';

export interface ExpoPushSettings {
  /** `https://exp.host/--/api/v2/push/send`. */
  apiUrl: string;
  /**
   * Token de acceso de Expo. Es opcional en el servicio, pero obligatorio si el proyecto activa
   * "Enhanced Security for Push Notifications". Es un secreto: nunca se registra.
   */
  accessToken?: string;
  timeoutMs: number;
}

type Fetch = typeof fetch;

/** Expo acepta hasta 100 mensajes por petición. */
const MAX_PER_REQUEST = 100;

interface ExpoTicket {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string } | null;
}

interface ExpoResponse {
  data?: ExpoTicket[] | null;
  errors?: { message?: string }[] | null;
}

/**
 * Envío por Expo Push Service (T7, propuesto en docs/frontend-pending-plan.md). Un envío aceptado
 * devuelve un "ticket": significa que Expo lo recibió, no que el celular lo mostró. La entrega real
 * se consulta después con los recibos, que todavía no se usan; lo que sí se aprovecha es
 * `DeviceNotRegistered`, que llega en el ticket y permite apagar el token.
 *
 * Nunca registra el token de acceso ni el contenido del aviso.
 */
export class ExpoPushSender implements PushSenderPort {
  private readonly logger = new Logger('Push');

  constructor(
    private readonly settings: ExpoPushSettings,
    private readonly http: Fetch = (...args) => fetch(...args),
  ) {}

  async send(
    messages: readonly { device: PushDevice; message: PushMessage }[],
  ): Promise<readonly PushResult[]> {
    const results: PushResult[] = [];
    for (let from = 0; from < messages.length; from += MAX_PER_REQUEST) {
      const chunk = messages.slice(from, from + MAX_PER_REQUEST);
      results.push(...(await this.sendChunk(chunk)));
    }
    return results;
  }

  private async sendChunk(
    chunk: readonly { device: PushDevice; message: PushMessage }[],
  ): Promise<PushResult[]> {
    const body = chunk.map(({ device, message }) => ({
      to: device.token,
      title: message.title,
      body: message.body,
      data: message.data,
      sound: 'default',
      priority: 'high',
      // Android exige un canal; la app crea "default" al registrar el dispositivo.
      channelId: 'default',
    }));

    let response: Response;
    try {
      response = await this.http(this.settings.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.settings.accessToken
            ? { Authorization: `Bearer ${this.settings.accessToken}` }
            : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.settings.timeoutMs),
      });
    } catch (error) {
      // Red caída o timeout: toda la tanda queda para el próximo intento.
      return this.allFailed(chunk, errorMessage(error));
    }

    if (!response.ok) {
      return this.allFailed(chunk, `HTTP ${response.status}`);
    }

    let payload: ExpoResponse;
    try {
      payload = (await response.json()) as ExpoResponse;
    } catch (error) {
      return this.allFailed(chunk, errorMessage(error));
    }

    // Error de la petición completa (p. ej. credenciales): ningún ticket llega.
    const requestError = payload.errors?.[0]?.message;
    if (requestError) return this.allFailed(chunk, requestError);

    const tickets = payload.data ?? [];
    return chunk.map(({ device }, index) => {
      const ticket = tickets[index];
      if (!ticket) return { token: device.token, status: 'failed', reason: 'sin ticket' };
      if (ticket.status === 'ok') return { token: device.token, status: 'sent' };
      if (ticket.details?.error === 'DeviceNotRegistered') {
        return { token: device.token, status: 'unregistered' };
      }
      return {
        token: device.token,
        status: 'failed',
        reason: ticket.details?.error ?? ticket.message ?? 'error sin motivo',
      };
    });
  }

  private allFailed(chunk: readonly { device: PushDevice }[], reason: string): PushResult[] {
    this.logger.warn({ event: 'push.send_failed', reason, messages: chunk.length });
    return chunk.map(({ device }) => ({ token: device.token, status: 'failed', reason }));
  }
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Doble para desarrollo y pruebas: acepta todo y lo registra sin el texto del aviso. Permite
 * probar el ciclo completo (se genera, se envía y no se repite) sin un proyecto de Expo.
 */
export class FakePushSender implements PushSenderPort {
  private readonly logger = new Logger('Push');

  send(
    messages: readonly { device: PushDevice; message: PushMessage }[],
  ): Promise<readonly PushResult[]> {
    for (const { device, message } of messages) {
      this.logger.log({
        event: 'push.fake_sent',
        platform: device.platform,
        type: message.data.type,
        notificationId: message.data.notificationId,
      });
    }
    return Promise.resolve(
      messages.map(({ device }) => ({ token: device.token, status: 'sent' }) as const),
    );
  }
}
