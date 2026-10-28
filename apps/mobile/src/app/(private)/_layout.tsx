import { Stack } from 'expo-router';

import { useRetryPendingLanguageSync } from '@/presentation/i18n/useLanguage';
import { JoinFlowProvider } from '@/presentation/join/JoinFlowProvider';

import {
  useCatalogScreenOptions,
  useIsDevEnvironment,
  useJoinScreenOptions,
} from '@/presentation/navigation/screenOptions';

export default function PrivateLayout() {
  const joinOptions = useJoinScreenOptions();
  const catalogOptions = useCatalogScreenOptions();
  const isDev = useIsDevEnvironment();
  // El perfil del backend exige sesión: el idioma pendiente se reintenta al entrar a la zona privada.
  useRetryPendingLanguageSync();

  // El borrador de unión vive mientras dure la sesión privada; cada flujo lo reinicia al empezar.
  return (
    <JoinFlowProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="join/index" options={joinOptions.chooseService} />
        <Stack.Screen name="join/payout-amount" options={joinOptions.payoutAmount} />
        <Stack.Screen name="join/monthly-pay-in" options={joinOptions.monthlyPayIn} />
        <Stack.Screen name="join/slot" options={joinOptions.slot} />
        <Stack.Screen name="join/saving-program" options={joinOptions.savingProgram} />
        <Stack.Protected guard={isDev}>
          <Stack.Screen name="catalog" options={catalogOptions} />
        </Stack.Protected>
      </Stack>
    </JoinFlowProvider>
  );
}
