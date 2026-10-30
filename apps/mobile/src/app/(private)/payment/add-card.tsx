import { router } from 'expo-router';

import { AddCardScreen } from '@/presentation/payment/screens/AddCardScreen';

export default function AddCardRoute() {
  return <AddCardScreen onAdded={() => router.back()} />;
}
