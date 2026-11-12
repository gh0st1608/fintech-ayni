import { router } from 'expo-router';

import { SavingCirclesScreen } from '@/presentation/saving/screens/SavingCirclesScreen';

export default function SavingProgramRoute() {
  return (
    <SavingCirclesScreen
      onConfirm={(planId, months) =>
        router.push({
          pathname: '/join/saving-confirm',
          params: { planId, months: String(months) },
        })
      }
    />
  );
}
