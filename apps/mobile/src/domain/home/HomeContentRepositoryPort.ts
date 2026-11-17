import type { HomeContent } from './HomeContent';

/** Contenido de Home (GET /v1/home/content, COPAYNI-25). */
export interface HomeContentRepositoryPort {
  /** `language` es el de la app; el backend cae al español si no tiene ese idioma. */
  get(language: string, signal?: AbortSignal): Promise<HomeContent>;
}
