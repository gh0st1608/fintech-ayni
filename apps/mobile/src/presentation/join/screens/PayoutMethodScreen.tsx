import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { PayoutMethods } from '@/domain/payouts/value-objects/PayoutMethod';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { PayoutMethodPicker } from '@/presentation/payouts/PayoutMethodPicker';
import { usePayoutMethods } from '@/presentation/payouts/usePayoutMethods';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Screen } from '@/presentation/shared/components/Screen';
import { Stepper } from '@/presentation/shared/components/Stepper';
import { spacing } from '@/presentation/theme/tokens';

import { useJoinFlow } from '../JoinFlowProvider';
import { JOIN_FLOW_STEPS } from './PayoutAmountScreen';

interface PayoutMethodScreenProps {
  /** Vuelve al paso 1 si se entra sin los pasos anteriores. */
  onStartOver: () => void;
  /** Se llama con el método ya guardado en el backend y en el borrador; la ruta va a confirmar. */
  onNext: () => void;
}

/**
 * Paso 4 de 4 (Figma 55:9520): cómo se recibe el payout. Los métodos los define el backend; el
 * actual aparece preseleccionado. Los datos de la cuenta llegan con "Add Account" (D4).
 */
export function PayoutMethodScreen({ onStartOver, onNext }: PayoutMethodScreenProps) {
  const { t } = useTranslation();
  const { draft } = useJoinFlow();
  const methods = usePayoutMethods();

  let body: React.ReactNode;
  if (!draft.slot) {
    body = (
      <View style={styles.center}>
        <AppText accessibilityRole="alert" style={styles.centerText}>
          {t('join.payoutMethod.missingSteps')}
        </AppText>
        <Button
          label={t('join.payoutMethod.startOver')}
          variant="secondary"
          onPress={onStartOver}
        />
      </View>
    );
  } else if (methods.isPending) {
    body = <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />;
  } else if (methods.isError) {
    body = (
      <View style={styles.center}>
        <AppText accessibilityRole="alert" style={styles.centerText}>
          {errorMessage(t, methods.error)}
        </AppText>
        <Button label={t('common.retry')} variant="secondary" onPress={() => methods.refetch()} />
      </View>
    );
  } else {
    body = <MethodPicker catalog={methods.data} onNext={onNext} />;
  }

  return (
    <Screen edges={['bottom']}>
      <Stepper
        current={4}
        total={JOIN_FLOW_STEPS}
        accessibilityLabel={t('join.step', { current: 4, total: JOIN_FLOW_STEPS })}
      />
      {body}
    </Screen>
  );
}

function MethodPicker({ catalog, onNext }: { catalog: PayoutMethods; onNext: () => void }) {
  const { t } = useTranslation();
  const { draft, setPayoutMethod } = useJoinFlow();
  return (
    <PayoutMethodPicker
      catalog={catalog}
      preferred={draft.payoutMethod}
      submitLabel={t('join.payoutMethod.continue')}
      onSaved={(type) => {
        setPayoutMethod(type);
        onNext();
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
});
