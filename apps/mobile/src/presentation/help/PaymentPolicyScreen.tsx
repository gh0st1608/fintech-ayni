import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { useFormatDate } from '@/presentation/formatters/formatDate';
import { useHelp } from '@/presentation/help/useHelp';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { EmptyState } from '@/presentation/shared/components/EmptyState';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, spacing } from '@/presentation/theme/tokens';

/**
 * Política de pagos (COPAYNI-83): vencimientos, gracia, mora, devoluciones y retención del pozo.
 * El texto lo aprueba Legal (L4); mientras tanto se avisa que se publicará pronto.
 */
export function PaymentPolicyScreen() {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const help = useHelp();

  if (help.isPending) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />
      </Screen>
    );
  }
  if (help.isError) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <AppText accessibilityRole="alert">{errorMessage(t, help.error)}</AppText>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => void help.refetch()}
          />
        </View>
      </Screen>
    );
  }
  const policy = help.data.paymentPolicy;
  if (!policy) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState
          title={t('help.policyPendingTitle')}
          description={t('help.policyPendingDescription')}
          testID="policy-pending"
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {policy.body
          .split(/\n\s*\n/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean)
          .map((paragraph, index) => (
            <AppText key={index}>{paragraph}</AppText>
          ))}
        <AppText variant="caption" color={colors.neutral600}>
          {t('help.policyUpdated', { date: formatDate(policy.updatedAt, 'date') })}
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.m },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
});
