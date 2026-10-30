import { router, useLocalSearchParams } from 'expo-router';

import { PayInstallmentScreen } from '@/presentation/payment/screens/PayInstallmentScreen';

export default function PayInstallmentRoute() {
  const { installmentId } = useLocalSearchParams<{ installmentId: string }>();
  return (
    <PayInstallmentScreen
      installmentId={installmentId}
      onAddCard={() => router.push('/payment/add-card')}
      onDone={() => router.back()}
    />
  );
}
