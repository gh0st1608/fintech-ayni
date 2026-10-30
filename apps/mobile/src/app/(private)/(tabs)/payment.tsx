import { router } from 'expo-router';

import { PaymentScreen } from '@/presentation/payment/screens/PaymentScreen';

export default function PaymentRoute() {
  return (
    <PaymentScreen
      onJoin={() => router.push('/join')}
      onOpenHistory={() => router.push('/payment/history')}
      onOpenEligibility={() => router.push('/payment/eligibility')}
      onOpenSettings={() => router.push('/payment/settings')}
      onPay={(installmentId) =>
        router.push({ pathname: '/payment/pay/[installmentId]', params: { installmentId } })
      }
    />
  );
}
