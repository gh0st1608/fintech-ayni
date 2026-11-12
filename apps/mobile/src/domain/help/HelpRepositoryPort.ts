import type { HelpContent } from './Help';

/** Ayuda de la app (GET /v1/help?lang=, docs/api/help.md). */
export interface HelpRepositoryPort {
  get(language: string, signal?: AbortSignal): Promise<HelpContent>;
}
