import { QueryClientProvider } from '@tanstack/react-query';
import type { i18n } from 'i18next';
import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AppContainer } from '@/application/AppContainer';
import { createI18n } from '@/presentation/i18n/createI18n';
import { createQueryClient } from '@/presentation/query/queryClient';
import { useAppFonts } from '@/presentation/theme/fonts';

import { ContainerProvider } from './ContainerProvider';
import { SessionProvider } from './SessionProvider';

interface AppProvidersProps {
  container: AppContainer;
  fallbackLanguage: string;
  children: React.ReactNode;
}

/** Providers globales. Renderiza la app cuando el idioma inicial y la tipografía están listos. */
export function AppProviders({ container, fallbackLanguage, children }: AppProvidersProps) {
  const [queryClient] = useState(createQueryClient);
  const [i18nInstance, setI18nInstance] = useState<i18n | null>(null);
  const fontsReady = useAppFonts();

  useEffect(() => {
    let mounted = true;
    container.i18n.resolveLanguage
      .execute()
      .catch(() => fallbackLanguage)
      .then((language) => createI18n(language, fallbackLanguage))
      .then((instance) => {
        if (mounted) setI18nInstance(instance);
      });
    return () => {
      mounted = false;
    };
  }, [container, fallbackLanguage]);

  // El splash definitivo llega con COPAYNI-18.
  if (!i18nInstance || !fontsReady) return null;

  return (
    <SafeAreaProvider>
      <ContainerProvider container={container}>
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18nInstance}>
            <SessionProvider>{children}</SessionProvider>
          </I18nextProvider>
        </QueryClientProvider>
      </ContainerProvider>
    </SafeAreaProvider>
  );
}
