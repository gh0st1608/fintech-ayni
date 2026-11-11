import { useLocalSearchParams } from 'expo-router';

import { TransactionDetailScreen } from '@/presentation/payment/screens/TransactionDetailScreen';

export default function TransactionDetailRoute() {
  const { transactionId, type } = useLocalSearchParams<{ transactionId: string; type: string }>();
  return <TransactionDetailScreen transactionId={transactionId} type={type} />;
}
