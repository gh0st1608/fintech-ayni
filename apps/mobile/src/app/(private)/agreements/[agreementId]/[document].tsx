import { router, useLocalSearchParams } from 'expo-router';

import { AgreementDocumentScreen } from '@/presentation/agreements/screens/AgreementDocumentScreen';

export default function AgreementDocumentRoute() {
  const { agreementId, document } = useLocalSearchParams<{
    agreementId: string;
    document: string;
  }>();
  return (
    <AgreementDocumentScreen
      agreementId={agreementId}
      document={document}
      onDone={() => router.back()}
    />
  );
}
