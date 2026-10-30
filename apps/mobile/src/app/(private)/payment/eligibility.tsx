import { router } from 'expo-router';

import { PayoutEligibilityScreen } from '@/presentation/payment/screens/PayoutEligibilityScreen';

export default function PayoutEligibilityRoute() {
  return (
    <PayoutEligibilityScreen
      actions={{
        nationalId: () => router.push('/profile/documents/national-id'),
        payoutMethod: () => router.push('/payment/payout-method'),
        duePayments: () => router.navigate('/payment'),
      }}
    />
  );
}
