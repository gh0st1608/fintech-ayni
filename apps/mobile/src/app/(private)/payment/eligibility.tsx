import { router } from 'expo-router';

import { PayoutEligibilityScreen } from '@/presentation/payment/screens/PayoutEligibilityScreen';

export default function PayoutEligibilityRoute() {
  return (
    <PayoutEligibilityScreen
      actions={{
        // Scan National ID llega con los documentos (COPAYNI-47); hasta entonces, sin acción.
        payoutMethod: () => router.push('/payment/payout-method'),
        duePayments: () => router.navigate('/payment'),
      }}
    />
  );
}
