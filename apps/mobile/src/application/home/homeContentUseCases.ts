import type { HomeContent } from '@/domain/home/HomeContent';
import type { HomeContentRepositoryPort } from '@/domain/home/HomeContentRepositoryPort';

/** Ofertas y metas populares de Home (COPAYNI-25). Una sección vacía se oculta en la pantalla. */
export class GetHomeContentUseCase {
  constructor(private readonly repository: HomeContentRepositoryPort) {}

  execute(language: string, signal?: AbortSignal): Promise<HomeContent> {
    return this.repository.get(language, signal);
  }
}
