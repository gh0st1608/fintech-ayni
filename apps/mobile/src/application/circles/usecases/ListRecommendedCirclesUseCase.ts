import type { CircleQuoteRepositoryPort } from '@/domain/circles/ports/CircleQuoteRepositoryPort';
import type { RecommendedCircle } from '@/domain/circles/RecommendedCircle';

/** Círculos recomendados de Home y de Circles vacío (COPAYNI-25). */
export class ListRecommendedCirclesUseCase {
  constructor(private readonly repository: CircleQuoteRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<RecommendedCircle[]> {
    return this.repository.listRecommended(signal);
  }
}
