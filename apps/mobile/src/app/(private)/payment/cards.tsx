import { router } from 'expo-router';

import { SavedCardsScreen } from '@/presentation/payment/screens/SavedCardsScreen';

export default function SavedCardsRoute() {
  return <SavedCardsScreen onAddCard={() => router.push('/payment/add-card')} />;
}
