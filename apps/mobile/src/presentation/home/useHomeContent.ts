import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { useContainer } from '@/presentation/providers/ContainerProvider';

export const homeContentQueryKey = ['home', 'content'] as const;

/**
 * Ofertas y metas populares de Home (COPAYNI-25). El idioma entra en la clave: al cambiarlo, el
 * contenido se vuelve a pedir en vez de quedarse en el anterior.
 */
export function useHomeContent() {
  const { homeContent } = useContainer();
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  return useQuery({
    queryKey: [...homeContentQueryKey, language],
    queryFn: ({ signal }) => homeContent.get.execute(language, signal),
  });
}
