import { router } from 'expo-router';

import { AgreementsScreen } from '@/presentation/agreements/screens/AgreementsScreen';

export default function AgreementsRoute() {
  return <AgreementsScreen onOpen={(agreementId) => router.push(`/agreements/${agreementId}`)} />;
}
