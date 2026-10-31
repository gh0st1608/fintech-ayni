import { router } from 'expo-router';

import { ProofOfIncomeFlowScreen } from '@/presentation/documents/screens/ProofOfIncomeScreen';

export default function ProofOfIncomeRoute() {
  return <ProofOfIncomeFlowScreen onDone={() => router.back()} />;
}
