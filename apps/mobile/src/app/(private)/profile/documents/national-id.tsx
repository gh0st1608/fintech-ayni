import { router } from 'expo-router';

import { ScanNationalIdScreen } from '@/presentation/documents/screens/ScanNationalIdScreen';

export default function ScanNationalIdRoute() {
  return <ScanNationalIdScreen onDone={() => router.back()} />;
}
