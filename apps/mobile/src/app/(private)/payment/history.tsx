import { router } from 'expo-router';

import { PaymentHistoryScreen } from '@/presentation/payment/screens/PaymentHistoryScreen';

export default function PaymentHistoryRoute() {
  return (
    <PaymentHistoryScreen
      onExploreCircles={() => router.navigate('/circles')}
      onOpenTransaction={(type, transactionId) =>
        router.push({
          pathname: '/payment/transaction/[transactionId]',
          params: { transactionId, type },
        })
      }
    />
  );
}
