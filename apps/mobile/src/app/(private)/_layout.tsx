import { Stack } from 'expo-router';

import { useRetryPendingLanguageSync } from '@/presentation/i18n/useLanguage';
import { JoinFlowProvider } from '@/presentation/join/JoinFlowProvider';

import {
  useCatalogScreenOptions,
  useIsDevEnvironment,
  useJoinScreenOptions,
  usePaymentScreenOptions,
} from '@/presentation/navigation/screenOptions';

export default function PrivateLayout() {
  const joinOptions = useJoinScreenOptions();
  const catalogOptions = useCatalogScreenOptions();
  const paymentOptions = usePaymentScreenOptions();
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
        <Stack.Screen name="join/payout-method" options={joinOptions.payoutMethod} />
        <Stack.Screen name="join/confirm" options={joinOptions.confirm} />
        <Stack.Screen name="join/saving-program" options={joinOptions.savingProgram} />
        <Stack.Screen name="payment/history" options={paymentOptions.history} />
        <Stack.Screen name="payment/eligibility" options={paymentOptions.eligibility} />
        <Stack.Screen name="payment/settings" options={paymentOptions.settings} />
        <Stack.Screen name="payment/payout-method" options={paymentOptions.payoutMethod} />
        <Stack.Screen name="payment/cards" options={paymentOptions.cards} />
        <Stack.Screen name="payment/add-card" options={paymentOptions.addCard} />
        <Stack.Screen name="payment/pay/[installmentId]" options={paymentOptions.pay} />
        <Stack.Protected guard={isDev}>
          <Stack.Screen name="catalog" options={catalogOptions} />
        </Stack.Protected>
      </Stack>
    </JoinFlowProvider>
  );
}
