import { router, useLocalSearchParams } from 'expo-router';

import { SavingConfirmScreen } from '@/presentation/saving/screens/SavingConfirmScreen';

export default function SavingConfirmRoute() {
  const { planId, months } = useLocalSearchParams<{ planId: string; months: string }>();
  return (
    <SavingConfirmScreen
      planId={planId}
      months={Number(months)}
      onAddCard={() => router.push('/payment/add-card')}
      onDone={() => router.dismissAll()}
    />
  );
}
