import { router } from 'expo-router';

import { useJoinFlow } from '@/presentation/join/JoinFlowProvider';
import { JoinConfirmScreen } from '@/presentation/join/screens/JoinConfirmScreen';

// Scan National ID (COPAYNI-47) y Proof of Income (R5) todavía no tienen ruta: la pantalla
// muestra el motivo del rechazo sin acción.
export default function JoinConfirmRoute() {
  const { start } = useJoinFlow();
  return (
    <JoinConfirmScreen
      onStartOver={() => router.dismissTo('/join/payout-amount')}
      onEditPayout={() => router.dismissTo('/join/payout-amount')}
      onEditInstallment={() => router.dismissTo('/join/monthly-pay-in')}
      onEditSlot={() => router.dismissTo('/join/slot')}
      onEditPayoutMethod={() => router.dismissTo('/join/payout-method')}
      onDone={() => {
        router.dismissTo('/circles');
        // La unión terminó: el siguiente flujo empieza vacío.
        start();
      }}
    />
  );
}
