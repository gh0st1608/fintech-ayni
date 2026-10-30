import { router } from 'expo-router';

import { DocumentsScreen } from '@/presentation/documents/screens/DocumentsScreen';

export default function DocumentsRoute() {
  return (
    <DocumentsScreen
      onOpen={{
        nationalId: () => router.push('/profile/documents/national-id'),
        proofOfIncome: () => router.push('/profile/documents/proof-of-income'),
      }}
    />
  );
}
