import { router } from 'expo-router';

import { PaymentHistoryScreen } from '@/presentation/payment/screens/PaymentHistoryScreen';

export default function PaymentHistoryRoute() {
  return <PaymentHistoryScreen onExploreCircles={() => router.navigate('/circles')} />;
}
