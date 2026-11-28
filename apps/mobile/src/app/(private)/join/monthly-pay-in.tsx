import { router, Stack } from 'expo-router';

import { useInstallmentTitle } from '@/presentation/join/hooks/useInstallmentTitle';
import { MonthlyPayInScreen } from '@/presentation/join/screens/MonthlyPayInScreen';

export default function MonthlyPayInRoute() {
  // El título lo pone la ruta y no el stack porque depende de la cadencia elegida (COPAYNI-116).
  const title = useInstallmentTitle();

  return (
    <>
      <Stack.Screen options={{ title }} />
      <MonthlyPayInScreen
        onEdit={() => router.dismissTo('/join/payout-amount')}
        onEditCadence={() => router.dismissTo('/join/frequency')}
        onNext={() => router.push('/join/slot')}
      />
    </>
  );
}
