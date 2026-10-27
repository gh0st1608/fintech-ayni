import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createI18n } from '@/presentation/i18n/createI18n';
import { ContainerProvider } from '@/presentation/providers/ContainerProvider';
import { SessionProvider } from '@/presentation/providers/SessionProvider';
import { createQueryClient } from '@/presentation/query/queryClient';

import { createTestContainer } from './fakes/createTestContainer';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** Monta una pantalla con los providers reales de la app y el contenedor de pruebas. */
export async function renderWithProviders(
  ui: React.ReactElement,
  setup = createTestContainer(),
  language = 'es',
) {
  const i18n = await createI18n(language, 'es');
  const queryClient = createQueryClient();
  // Sin recolección: sus timers de 5 min mantendrían vivo a Jest al terminar el archivo.
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({
    queries: { ...defaults.queries, gcTime: Infinity },
    mutations: { ...defaults.mutations, gcTime: Infinity },
  });
  const view = await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <ContainerProvider container={setup.container}>
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <SessionProvider>{ui}</SessionProvider>
          </I18nextProvider>
        </QueryClientProvider>
      </ContainerProvider>
    </SafeAreaProvider>,
  );
  return { ...view, ...setup };
}
