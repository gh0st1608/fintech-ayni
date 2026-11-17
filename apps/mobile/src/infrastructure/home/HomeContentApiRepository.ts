import { z } from 'zod';

import {
  EMPTY_HOME_CONTENT,
  type HomeContent,
  type HomeIllustration,
  type HomeItem,
  type HomeTarget,
} from '@/domain/home/HomeContent';
import type { HomeContentRepositoryPort } from '@/domain/home/HomeContentRepositoryPort';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';

/** El backend usa snake_case en los destinos y guiones en las ilustraciones. */
const TARGET_BY_DTO: Record<string, HomeTarget> = {
  savings_plans: 'savingsPlans',
  join_circle: 'joinCircle',
  referral: 'referral',
  help: 'help',
  none: 'none',
};

const ILLUSTRATION_BY_DTO: Record<string, HomeIllustration> = {
  megaphone: 'megaphone',
  gift: 'gift',
  'piggy-bank': 'piggyBank',
  calendar: 'calendar',
  school: 'school',
  home: 'home',
  travel: 'travel',
  celebration: 'celebration',
};

const itemDto = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().nullable(),
  illustration: z.string(),
  background: z.string(),
  target: z.string(),
  targetAmount: z.number().int().nullable(),
});

const contentDto = z.object({
  offers: z.array(itemDto),
  goals: z.array(itemDto),
});

/**
 * Una tarjeta con un destino o una ilustración que esta versión de la app no conoce se omite: es
 * mejor no mostrarla que dibujar algo que no sabe abrir.
 */
function toItem(dto: z.infer<typeof itemDto>): HomeItem | null {
  const target = TARGET_BY_DTO[dto.target];
  const illustration = ILLUSTRATION_BY_DTO[dto.illustration];
  if (!target || !illustration) return null;
  return {
    id: dto.id,
    title: dto.title,
    subtitle: dto.subtitle,
    illustration,
    background: dto.background,
    target,
    targetAmount: dto.targetAmount,
  };
}

/** Contenido de Home (GET /v1/home/content, docs/api/home.md). */
export class HomeContentApiRepository implements HomeContentRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async get(language: string, signal?: AbortSignal): Promise<HomeContent> {
    const dto = await this.http.get(`/home/content?lang=${encodeURIComponent(language)}`, {
      signal,
      parse: (data) => contentDto.parse(data),
    });
    return {
      offers: dto.offers.map(toItem).filter((item) => item !== null),
      goals: dto.goals.map(toItem).filter((item) => item !== null),
    };
  }
}

/** Contenido en memoria para desarrollo y pruebas; vacío por defecto, como una cuenta nueva. */
export class InMemoryHomeContentRepository implements HomeContentRepositoryPort {
  constructor(private content: HomeContent = EMPTY_HOME_CONTENT) {}

  get(): Promise<HomeContent> {
    return Promise.resolve(this.content);
  }

  set(content: HomeContent): void {
    this.content = content;
  }
}
