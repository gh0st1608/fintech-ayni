import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppError } from '@/domain/shared/errors/AppError';
import { createI18n } from '@/presentation/i18n/createI18n';
import { OfflineBanner } from '@/presentation/shared/components/OfflineBanner';

import { ConnectivityContext, ConnectivityTracker } from './connectivity';
import { createQueryClient } from './queryClient';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('ConnectivityTracker (D10)', () => {
  it('un error de red marca la falta de conexión y una respuesta la levanta', () => {
    const tracker = new ConnectivityTracker();
    const listener = jest.fn();
    const unsubscribe = tracker.subscribe(listener);

    tracker.reportError(new AppError('network', 'sin red'));
    expect(tracker.isOffline()).toBe(true);
    tracker.reportError(new AppError('network', 'otra vez'));
    expect(listener).toHaveBeenCalledTimes(1);

    tracker.reportResponse();
    expect(tracker.isOffline()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    tracker.reportError(new AppError('network', 'sin red'));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('un error que respondió el servidor prueba que hay conexión; un timeout no dice nada', () => {
    const tracker = new ConnectivityTracker();
    tracker.reportError(new AppError('network', 'sin red'));
    tracker.reportError(new AppError('timeout', 'lento'));
    tracker.reportError(new Error('cualquiera'));
    expect(tracker.isOffline()).toBe(true);
    tracker.reportError(new AppError('business', 'regla'));
    expect(tracker.isOffline()).toBe(false);
  });
});

describe('OfflineBanner', () => {
  async function renderApp(queryFn: () => Promise<string>) {
    const tracker = new ConnectivityTracker();
    const queryClient = createQueryClient(tracker);
    queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    const i18n = await createI18n('es', 'es');
    function Screen() {
      const query = useQuery({ queryKey: ['dato'], queryFn });
      return <Text>{query.data ?? 'cargando'}</Text>;
    }
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <QueryClientProvider client={queryClient}>
          <ConnectivityContext.Provider value={tracker}>
            <I18nextProvider i18n={i18n}>
              <Screen />
              <OfflineBanner />
            </I18nextProvider>
          </ConnectivityContext.Provider>
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    return { tracker, queryClient };
  }

  it('aparece cuando una lectura falla sin red y "Reintentar" la vuelve a pedir', async () => {
    const queryFn = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new AppError('network', 'sin red'))
      .mockResolvedValue('datos al día');
    await renderApp(queryFn);

    expect(await screen.findByText(/Sin conexión/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('datos al día')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('offline-banner')).toBeNull());
  });

  it('una mutación sin red también lo muestra', async () => {
    const { queryClient, tracker } = await renderApp(() => Promise.resolve('ok'));
    await act(async () => {
      await queryClient
        .getMutationCache()
        .build(queryClient, {
          mutationFn: () => Promise.reject(new AppError('network', 'sin red')),
        })
        .execute(undefined)
        .catch(() => undefined);
    });
    expect(tracker.isOffline()).toBe(true);
    expect(await screen.findByTestId('offline-banner')).toBeTruthy();
  });

  it('sin el contexto, no muestra nada', async () => {
    const i18n = await createI18n('es', 'es');
    const queryClient = createQueryClient();
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <OfflineBanner />
          </I18nextProvider>
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });
});
