import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { PayoutMethodPicker } from '@/presentation/payouts/PayoutMethodPicker';
import { usePayoutMethods } from '@/presentation/payouts/usePayoutMethods';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Screen } from '@/presentation/shared/components/Screen';
import { spacing } from '@/presentation/theme/tokens';

/** "Change Payout Method" de Payment Settings (COPAYNI-37 y 38): el mismo selector que la unión. */
export function ChangePayoutMethodScreen({ onSaved }: { onSaved: () => void }) {
  const { t } = useTranslation();
  const methods = usePayoutMethods();

  return (
    <Screen edges={['bottom']}>
      {methods.isPending ? (
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />
      ) : methods.isError ? (
        <View style={styles.center}>
          <AppText accessibilityRole="alert" style={styles.centerText}>
            {errorMessage(t, methods.error)}
          </AppText>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => void methods.refetch()}
          />
        </View>
      ) : (
        <PayoutMethodPicker
          catalog={methods.data}
          submitLabel={t('payment.settings.save')}
          onSaved={onSaved}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
});
