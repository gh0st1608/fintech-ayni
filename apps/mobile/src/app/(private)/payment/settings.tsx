import { router } from 'expo-router';

import { PaymentSettingsScreen } from '@/presentation/payment/screens/PaymentSettingsScreen';

export default function PaymentSettingsRoute() {
  return (
    <PaymentSettingsScreen
      onChangePayoutMethod={() => router.push('/payment/payout-method')}
      onOpenSavedCards={() => router.push('/payment/cards')}
    />
  );
}
