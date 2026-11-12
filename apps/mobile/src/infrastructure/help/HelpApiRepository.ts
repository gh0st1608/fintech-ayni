import { z } from 'zod';

import type { HelpContent } from '@/domain/help/Help';
import type { HelpRepositoryPort } from '@/domain/help/HelpRepositoryPort';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';

const helpDto = z.object({
  language: z.string(),
  faqs: z.array(z.object({ id: z.string(), question: z.string(), answer: z.string() })),
  paymentPolicy: z
    .object({ body: z.string(), updatedAt: z.iso.datetime({ offset: true }) })
    .nullable(),
  // Solo enlaces de WhatsApp: la app no abre una URL arbitraria que llegue del servidor.
  support: z.object({ whatsapp: z.string().regex(/^https:\/\/wa\.me\/\d{8,15}$/) }).nullable(),
});

/** Adaptador HTTP de la ayuda (COPAYNI-83). */
export class HelpApiRepository implements HelpRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async get(language: string, signal?: AbortSignal): Promise<HelpContent> {
    const dto = await this.http.get(`/help?lang=${encodeURIComponent(language)}`, {
      signal,
      parse: (data) => helpDto.parse(data),
    });
    return {
      language: dto.language,
      faqs: dto.faqs,
      paymentPolicy: dto.paymentPolicy
        ? { body: dto.paymentPolicy.body, updatedAt: new Date(dto.paymentPolicy.updatedAt) }
        : null,
      whatsappUrl: dto.support?.whatsapp ?? null,
    };
  }
}
