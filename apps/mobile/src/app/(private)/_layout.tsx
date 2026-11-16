import { router, Stack } from 'expo-router';
import { useCallback } from 'react';

import { useRetryPendingLanguageSync } from '@/presentation/i18n/useLanguage';
import { JoinFlowProvider } from '@/presentation/join/JoinFlowProvider';
import { usePushRegistration } from '@/presentation/notifications/usePushRegistration';
import { useClaimPendingReferral } from '@/presentation/referrals/useReferrals';

import {
  useCatalogScreenOptions,
  useCircleScreenOptions,
  useIsDevEnvironment,
  useJoinScreenOptions,
  useNotificationScreenOptions,
  usePaymentScreenOptions,
  useProfileScreenOptions,
} from '@/presentation/navigation/screenOptions';

export default function PrivateLayout() {
  const joinOptions = useJoinScreenOptions();
  const catalogOptions = useCatalogScreenOptions();
  const paymentOptions = usePaymentScreenOptions();
  const circleOptions = useCircleScreenOptions();
  const profileOptions = useProfileScreenOptions();
  const notificationOptions = useNotificationScreenOptions();
  const isDev = useIsDevEnvironment();
  // El perfil del backend exige sesión: el idioma pendiente se reintenta al entrar a la zona privada.
  useRetryPendingLanguageSync();
  // Igual con el código de un enlace de invitación abierto antes de iniciar sesión.
  useClaimPendingReferral();
  // Registra el celular para los avisos y, al tocar uno, abre la bandeja (COPAYNI-85).
  usePushRegistration(useCallback(() => router.navigate('/notifications'), []));

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
        <Stack.Screen name="join/saving-confirm" options={joinOptions.savingConfirm} />
        <Stack.Screen name="circles/[circleId]" options={circleOptions.detail} />
        <Stack.Screen name="notifications/index" options={notificationOptions.inbox} />
        <Stack.Screen name="notifications/settings" options={notificationOptions.settings} />
        <Stack.Screen name="payment/history" options={paymentOptions.history} />
        <Stack.Screen
          name="payment/transaction/[transactionId]"
          options={paymentOptions.transaction}
        />
        <Stack.Screen name="payment/eligibility" options={paymentOptions.eligibility} />
        <Stack.Screen name="payment/settings" options={paymentOptions.settings} />
        <Stack.Screen name="payment/payout-method" options={paymentOptions.payoutMethod} />
        <Stack.Screen name="payment/cards" options={paymentOptions.cards} />
        <Stack.Screen name="payment/add-card" options={paymentOptions.addCard} />
        <Stack.Screen name="payment/pay/[installmentId]" options={paymentOptions.pay} />
        <Stack.Screen name="payment/help" options={paymentOptions.help} />
        <Stack.Screen name="payment/policy" options={paymentOptions.policy} />
        <Stack.Screen name="profile/personal-info" options={profileOptions.personalInfo} />
        <Stack.Screen name="profile/contact/[type]" options={profileOptions.contact} />
        <Stack.Screen name="profile/passcode" options={profileOptions.passcode} />
        <Stack.Screen name="profile/documents/index" options={profileOptions.documents} />
        <Stack.Screen name="profile/documents/national-id" options={profileOptions.nationalId} />
        <Stack.Screen name="profile/documents/identity" options={profileOptions.identity} />
        <Stack.Screen
          name="profile/documents/proof-of-income"
          options={profileOptions.proofOfIncome}
        />
        <Stack.Screen name="profile/referral" options={profileOptions.referral} />
        <Stack.Protected guard={isDev}>
          <Stack.Screen name="catalog" options={catalogOptions} />
        </Stack.Protected>
      </Stack>
    </JoinFlowProvider>
  );
}
