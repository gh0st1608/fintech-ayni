import type { HelpContent } from '@/domain/help/Help';
import type { HelpRepositoryPort } from '@/domain/help/HelpRepositoryPort';

/** La ayuda en el idioma de la app; el backend cae al español si no tiene ese idioma. */
export class GetHelpUseCase {
  constructor(private readonly repository: HelpRepositoryPort) {}

  execute(language: string, signal?: AbortSignal): Promise<HelpContent> {
    return this.repository.get(language, signal);
  }
}
