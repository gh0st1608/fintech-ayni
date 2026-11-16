import { router, useLocalSearchParams } from 'expo-router';

import { SignAgreementsScreen } from '@/presentation/agreements/screens/SignAgreementsScreen';

export default function SignAgreementsRoute() {
  const { agreementId } = useLocalSearchParams<{ agreementId: string }>();
  return (
    <SignAgreementsScreen
      agreementId={agreementId}
      onOpenDocument={(document) => router.push(`/agreements/${agreementId}/${document}`)}
      // Firmado (o ya sin plazo): la unión queda resuelta y se vuelve a las juntas.
      onDone={() => router.dismissTo('/circles')}
    />
  );
}
