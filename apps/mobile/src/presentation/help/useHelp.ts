import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { useContainer } from '@/presentation/providers/ContainerProvider';

/** La ayuda en el idioma activo (GET /help?lang=). La comparten Ayuda y Política de pagos. */
export function useHelp() {
  const { help } = useContainer();
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['help', i18n.language],
    queryFn: ({ signal }) => help.get.execute(i18n.language, signal),
  });
}
