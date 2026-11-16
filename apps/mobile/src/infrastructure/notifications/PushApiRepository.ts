import { z } from 'zod';

import type { PushRepositoryPort } from '@/domain/notifications/PushPorts';
import type {
  DevicePlatform,
  NotificationPreferences,
  NotificationPreferencesPatch,
} from '@/domain/notifications/PushRegistration';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';

const preferencesDto = z.object({
  pushEnabled: z.boolean(),
  categories: z.object({
    payments: z.boolean(),
    circles: z.boolean(),
    account: z.boolean(),
  }),
});

const toPreferences = (dto: z.infer<typeof preferencesDto>): NotificationPreferences => ({
  pushEnabled: dto.pushEnabled,
  categories: { ...dto.categories },
});

/** Dispositivos y preferencias de aviso (COPAYNI-85). */
export class PushApiRepository implements PushRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async registerDevice(
    device: { token: string; platform: DevicePlatform },
    signal?: AbortSignal,
  ): Promise<void> {
    await this.http.post('/me/devices', {
      body: device,
      signal,
      parse: () => undefined,
    });
  }

  async unregisterDevice(token: string): Promise<void> {
    await this.http.delete(`/me/devices/${encodeURIComponent(token)}`, {
      parse: () => undefined,
    });
  }

  async preferences(signal?: AbortSignal): Promise<NotificationPreferences> {
    return toPreferences(
      await this.http.get('/me/notification-preferences', {
        signal,
        parse: (data) => preferencesDto.parse(data),
      }),
    );
  }

  async savePreferences(patch: NotificationPreferencesPatch): Promise<NotificationPreferences> {
    return toPreferences(
      await this.http.put('/me/notification-preferences', {
        body: patch,
        parse: (data) => preferencesDto.parse(data),
      }),
    );
  }
}
