import { router } from 'expo-router';

import { ProofOfIncomeScreen } from '@/presentation/documents/screens/ProofOfIncomeScreen';

export default function ProofOfIncomeRoute() {
  return <ProofOfIncomeScreen onDone={() => router.back()} />;
}
